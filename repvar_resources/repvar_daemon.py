import os, sys, time, threading
from collections import deque
from random import randint
from flask import Flask, request, render_template, json
from repvar_resources.variant_finder import VariantFinder, repvar_from_data
from repvar_resources.job_queue import JobQueue

if sys.version_info >= (3,0): # Python 3.x imports
    from io import StringIO
    from tkinter import Tk as tk_root
    from tkinter.filedialog import asksaveasfilename as saveAs
else: # Python 2.x imports
    try:
        from cStringIO import StringIO
    except ImportError:
        from StringIO import StringIO
    from Tkinter import Tk as tk_root
    from tkFileDialog import asksaveasfilename as saveAs

def daemonURL(url):
    """Prefix added to the routes that should only ever be called by the page itself, not people. Doesn't really matter what the prefix is, but it must match that used by the daemonURL function in core.js."""
    return '/daemon' + url

# TODO:
# - Ensure js can load repvar files.
# - Display of previously specified avail and ignored seqs.
# - GUI for picking/editing both sets.
#   - Want a pane to appear to the right of 'choose' button listing strains with checkboxes (same one for avail and ignore). Select all box. Button at bottom for done, makes it disappear.
#   - While pane is open, strains can be clicked on the tree. Be really nice if you could click on an internal node, and it would select all children.
# - Some kind of 'calculating' attribute for a vfinder instance. Does nothing on local, but for server allows it to kill jobs that have been calculating for too long.

class RepvarDaemon(object):
    """Background daemon to server repvar requests.

      This class defines several custom HTTP status codes used to signal errors:
    550 - Specific error validating the user's tree.
    """
    def __init__(self, server_port, threads=2, web_server=False, verbose=False):
        max_upload_size = 20*1024*1024 # 20 MB
        error_log_lines = 10000
        self.server_port = server_port
        self.web_server = web_server
        self.verbose = verbose
        self.sessions = {} # Holds the repvar instances, with session IDs as keys.
        self.job_queue = JobQueue(threads)
        if not web_server: # Running locally.
            self.sessionID_length = 5 # Length of the unique session ID used.
            self.check_interval = 3 # Repeatedly wait this many seconds between running server tasks.
            self.maintain_interval = 2 # Interval that the page sends a signal to maintain the repvar instance.
            self.allowed_wait = 10 # Waits before timing out repvar instances.
        else: # Live, hosted web server.
            self.sessionID_length = 20
            self.check_interval = 10
            self.maintain_interval = 9
            self.allowed_wait = 30
        # # #  Activity and error logging:
        self.local_input_id = 'local_input_page' # Should match setupPage in input.js
        self.local_input_last_maintain = None
        self.page_has_loaded = False # Session timeouts are only allowed after this is set to True.
        self.should_quit = threading.Event()
        self.buff_lock = threading.Lock()
        self.log_buffer = StringIO()
        self.error_log = deque([], error_log_lines)
        self.error_occurred = False
        # # #  Server setup:
        module_dir = os.path.dirname(os.path.abspath(__file__))
        resources_dir = os.path.join(module_dir, 'resources')
        template_dir = os.path.join(resources_dir, 'templates')
        static_dir = os.path.join(resources_dir, 'static')
        self.server = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
        self.server.config['MAX_CONTENT_LENGTH'] = max_upload_size
        # # #  General server listening routes:
        @self.server.before_first_request
        def setup_tasks():
            if self.web_server: # Setup tasks to start for the web version.
                t = threading.Thread(target=self.start_web_server)
                t.daemon = True; t.start()
            else: # Setup tasks to begin for the local version.
                pass
        @self.server.route(daemonURL('/maintain-server'), methods=['POST'])
        def maintain_server():
            vf, idnum, msg = self.get_instance()
            if idnum == self.local_input_id:
                self.local_input_last_maintain = time.time()
                return 'local input page maintained.'
            elif vf == None:
                return msg
            vf.maintain()
            return 'maintain-server successful.'
        @self.server.route(daemonURL('/instance-closed'), methods=['POST'])
        def instance_closed():
            vf, idnum, msg = self.get_instance()
            if idnum == self.local_input_id:
                self.local_input_last_maintain = None
                if len(self.sessions) == 0:
                    self.should_quit.set()
                return 'local input page closed.'
            elif vf == None:
                return msg
            del self.sessions[idnum]
            if not self.web_server and len(self.sessions) == 0:
                self.should_quit.set()
            return 'instance-closed successful.'
        @self.server.route(daemonURL('/get-input-data'), methods=['POST'])
        def get_input_data():
            self.page_has_loaded = True
            idnum = request.form['session_id']
            if idnum in self.sessions:
                data_dict = self.get_vf_data_dict(idnum)
            else:
                data_dict = {'idnum':idnum, 'leaves':[], 'phyloxml_data':'', 'available':[], 'ignored':[]}
            data_dict.update({'maintain_interval':self.maintain_interval})
            return json.dumps(data_dict)
        # # #  Input page listening routes:
        @self.server.route(daemonURL('/upload-newick-tree'), methods=['POST'])
        def upload_newick_tree():
            try:
                tree_data = request.files['upload-file'].read()
            except Exception as err:
                return (str(err), 552)
            idnum = self.new_variant_finder(tree_data)
            return json.dumps(self.get_vf_data_dict(idnum))
        @self.server.route(daemonURL('/upload-repvar-file'), methods=['POST'])
        def upload_repvar_file():
            try:
                repvar_data = request.files['upload-file'].read()
            except Exception as err:
                return (str(err), 552)
            vf = repvar_from_data(repvar_data.splitlines(), verbose=False)
            idnum = self.add_variant_finder(vf)
            return json.dumps(self.get_vf_data_dict(idnum))
        @self.server.route(daemonURL('/save-repvar-file'), methods=['POST'])
        def save_repvar_file():
            idnum = request.form['session_id']
            self.update_vf_attributes(idnum)
            vf = self.sessions[idnum]
            if self.web_server:
                saved_locally = False
                repvar_str = vf.get_repvar_string()
            else:
                root = tk_root()
                filename = saveAs()
                root.destroy()
                if filename:
                    vf.save_repvar_file(filename)
                saved_locally, repvar_str = True, ''
            return json.dumps({'saved_locally':saved_locally, 'repvar_as_string':repvar_str})
        @self.server.route(daemonURL('/find-variants'), methods=['POST'])
        def find_variants():
            """Copies the current variant finder, to ensure that subsequent modifications from the input page do not affect instances already open in results pages."""
            idnum = request.form['session_id']
            self.update_vf_attributes(idnum)
            vf = self.sessions[idnum].copy()
            new_idnum = self.add_variant_finder(vf)
            num_vars = int(request.form['num_vars'])
            vars_range = int(request.form['vars_range'])
            dist_scale = 1.0
            cluster_method = request.form['cluster_method']
            for num in range(num_vars, vars_range + 1):
                params = (num, dist_scale)
                if params not in vf.cache:
                    vf.cache[params] = None
                    args = (num, dist_scale, cluster_method)
                    self.job_queue.addJob(vf.find_variants, args)
            # The input.js will take this new idnum, and open x new tabs. the url for each will have to incorporate the num of variants too (and dist_scale if it's actually useful).
            return new_idnum
        # # #  Results page listening routes:
        @self.server.route(daemonURL('/get-cluster-results'), methods=['POST'])
        def get_cluster_results():
            return 'results not ready'
        # # #  Serving the pages locally
        @self.server.route('/input')
        def render_input_page():
            return render_template('input.html')
        @self.server.route('/results')
        def render_results_page():
            return render_template('results.html')
    # # # # #  Public methods  # # # # #
    def new_variant_finder(self, tree_data, available=[], ignored=[], distance_scale=1.0):
        if type(tree_data) == bytes:
            tree_data = tree_data.decode()
        idnum = self.generateSessionID()
        vf = VariantFinder(tree_data, tree_format='newick', allowed_wait=self.allowed_wait, verbose=True) # TEST verbose=False
        vf.available = available
        vf.ignored = ignored
        vf.distance_scale = distance_scale
        self.sessions[idnum] = vf
        return idnum
    def add_variant_finder(self, vfinder):
        idnum = self.generateSessionID()
        vfinder._allowed_wait = self.allowed_wait
        self.sessions[idnum] = vfinder
        return idnum

    # # # # #  Running the server  # # # # #
    def start_server(self):
        if self.web_server:
            return False # Only used for local version.
        self.local_input_last_maintain = time.time() # Ensures the server doesn't close on input page
        olderr = sys.stderr
        sys.stderr = self.log_buffer
        t = threading.Thread(target=self.server.run,
            kwargs={'threaded':True, 'port':self.server_port})
        t.daemon = True; t.start()
        try:
            while not self.should_quit.is_set():
                self.should_quit.wait(self.check_interval)
                self.parse_err_logs()
                self.collect_garbage()
            self.parse_err_logs()
            if self.error_occurred:
                print("\nAt least one server call responded with an error. Session log:")
                print(''.join(self.error_log))
        except Exception as error:
            self.parse_err_logs()
            print("\nPython encountered an error. Start of session log:")
            print(''.join(self.error_log))
            print("\nEnd of session log. The error:\n"+str(error))
            # raise
        finally:
            sys.stderr = olderr
    def start_web_server(self):
        if not self.web_server:
            return False # Only used for web version.
        while not self.should_quit.is_set():
            self.should_quit.wait(self.check_interval)
            self.collect_garbage()

    # # # # #  Private methods  # # # # #
    def get_instance(self, should_fail=False):
        """HTTP status code 559 is used here to indicate a response was requested
        for a session ID that does not exist."""
        if should_fail: return None, 0, ('DEBUG ONLY: Intentional fail.', 588)
        idnum = request.form['session_id']
        if idnum in self.sessions:
            return self.sessions[idnum], idnum, 'session ID is valid.'
        else:
            return None, idnum, ("error, invalid session ID %s." % idnum, 559)
    def generateSessionID(self):
        # Javascript has issues parsing a number if the string begins with a non-significant zero.
        idnum = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        while idnum in self.sessions or idnum[0] == '0':
            idnum = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        return idnum
    def get_vf_data_dict(self, idnum):
        vf = self.sessions[idnum]
        return {'idnum':idnum, 'leaves':vf.leaves, 'chosen':sorted(vf.chosen), 'available':sorted(vf.available), 'ignored':sorted(vf.ignored), 'phyloxml_data':vf.phylo_xml_data}
    def update_vf_attributes(self, idnum):
        """chosen and ignored must first be cleared of their original values before being set."""
        # javascript returns an array of unicodes, not strs. But these seem to work interchangeably for some reason. If they don't probably just .encode('UTF-8') on each to convert it.
        vf = self.sessions[idnum]
        chsn = request.form.getlist('chosen[]')
        ignrd = request.form.getlist('ignored[]')
        avail = request.form.getlist('available[]')
        if chsn != vf.chosen or ignrd != vf.ignored:
            vf.chosen = []; vf.ignored = []
            vf.chosen = chsn; vf.ignored = ignrd
        if avail != vf.available:
            vf.available = avail

    # # #  Server maintainence  # # #
    def collect_garbage(self):
        to_remove = []
        for idnum, vf in self.sessions.items():
            alive = vf.still_alive()
            if not alive:
                to_remove.append(idnum)
        for idnum in to_remove:
            del self.sessions[idnum]
        if not self.web_server: # if personal server with no live instances.
            if self.local_input_last_maintain != None:
                if self.page_has_loaded:
                    if time.time() - self.local_input_last_maintain > self.allowed_wait:
                        self.local_input_last_maintain = None
                else:
                    self.local_input_last_maintain = time.time()
            if self.local_input_last_maintain == None and len(self.sessions) == 0:
                print('last Repvar instance closed, shutting down server.')
                self.should_quit.set()
    def close(self):
        """Careful with this; the web version should probably never have this
        method actually used."""
        self.should_quit.set()
    def parse_err_logs(self):
        with self.buff_lock:
            log_data = self.log_buffer.getvalue()
            self.log_buffer.seek(0)
            self.log_buffer.truncate(0)
        for line in log_data.splitlines(True):
            if '/maintain-server HTTP/1.1" 200' not in line:
                retcode = line.rpartition('-')[0].strip().rpartition('"')[2].strip()
                if retcode not in ('200','304') and '* Running on http://' not in line:
                    self.error_occurred = True
                    print('\nError encountered:\n%s' % line.strip())
                self.error_log.append(line)
