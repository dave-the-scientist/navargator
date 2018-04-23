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
# - Be really nice if you could click on an internal node, and it would select all children for avail/chosen/ignored.
# - Some kind of 'calculating' attribute for a vfinder instance. Does nothing on local, but for server allows it to kill jobs that have been calculating for too long.
# - Probably a good idea to have js fetch local_input_session_id and input_browser_id from this, instead of relying on them matching.
# - Should have a method to get session_id from the form, that throws an appropriate error if not found. Also a method to get other attrs, again so an error can be thrown if they're not found.
# - update_or_copy_vf() can find it's own s_id, doesn't need it as an arg. might need to rename the fxn

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
            allowed_wait = 10 # Wait seconds before timing out repvar instances.
        else: # Live, hosted web server.
            self.sessionID_length = 20
            self.check_interval = 10
            self.maintain_interval = 9
            allowed_wait = 30
        # # #  Server activity and error logging:
        self.local_input_session_id = 'local_input_page' # Should match setupPage in input.js
        self.connections = ConnectionManager(allowed_wait, self.local_input_session_id, web_server)
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
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            self.connections.maintain(s_id, b_id)
            return 'maintain-server successful.'
        @self.server.route(daemonURL('/instance-closed'), methods=['POST'])
        def instance_closed():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            elif s_id == '':
                return 'web server input closed'
            self.connections.close(s_id, b_id)
            if vf and self.connections.is_dead(s_id):
                del self.sessions[s_id]
            if not self.web_server and self.connections.all_dead():
                self.should_quit.set()
            return 'instance-closed successful.'
        @self.server.route(daemonURL('/get-input-data'), methods=['POST'])
        def get_input_data():
            s_id = request.form['session_id']
            if s_id in self.sessions:
                data_dict = self.get_vf_data_dict(s_id)
            else:
                data_dict = {'session_id':s_id, 'leaves':[], 'phyloxml_data':'', 'available':[], 'ignored':[]}
            data_dict.update({'maintain_interval':self.maintain_interval})
            return json.dumps(data_dict)
        # # #  Input page listening routes:
        @self.server.route(daemonURL('/upload-newick-tree'), methods=['POST'])
        def upload_newick_tree():
            s_id = request.form['session_id']
            try:
                tree_data = request.files['upload-file'].read()
            except Exception as err:
                return (str(err), 552)
            if s_id == self.local_input_session_id:
                self.connections.close(s_id, None)
            new_s_id = self.new_variant_finder(tree_data)
            return json.dumps(self.get_vf_data_dict(new_s_id))
        @self.server.route(daemonURL('/upload-repvar-file'), methods=['POST'])
        def upload_repvar_file():
            s_id = request.form['session_id']
            try:
                repvar_data = request.files['upload-file'].read()
            except Exception as err:
                return (str(err), 552)
            if s_id == self.local_input_session_id:
                self.connections.close(s_id, None)
            vf = repvar_from_data(repvar_data.splitlines(), verbose=self.verbose)
            new_s_id = self.add_variant_finder(vf)
            return json.dumps(self.get_vf_data_dict(new_s_id))
        @self.server.route(daemonURL('/save-repvar-file'), methods=['POST'])
        def save_repvar_file():
            s_id = request.form['session_id']
            s_id = self.update_or_copy_vf(s_id)
            vf = self.sessions[s_id]
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
            return json.dumps({'session_id':s_id, 'saved_locally':saved_locally, 'repvar_as_string':repvar_str})
        @self.server.route(daemonURL('/find-variants'), methods=['POST'])
        def find_variants():
            s_id = request.form['session_id']
            s_id = self.update_or_copy_vf(s_id)
            vf = self.sessions[s_id]
            num_vars = int(request.form['num_vars'])
            vars_range = int(request.form['vars_range'])
            dist_scale = 1.0
            cluster_method = request.form['cluster_method']
            runs_began = []
            for num in range(num_vars, vars_range + 1):
                params = (num, dist_scale)
                if params not in vf.cache:
                    runs_began.append(num)
                    vf.cache[params] = None
                    args = (num, dist_scale, cluster_method)
                    self.job_queue.addJob(vf.find_variants, args)
            return json.dumps({'session_id':s_id, 'runs_began':runs_began})
        # # #  Results page listening routes:
        @self.server.route(daemonURL('/get-cluster-results'), methods=['POST'])
        def get_cluster_results():
            s_id = request.form['session_id']
            num_vars = int(request.form['num_vars'])
            vf = self.sessions[s_id]
            dist_scale = 1.0
            params = (num_vars, dist_scale)
            if params not in vf.cache:
                print('Error: attempting to retrieve results for a clustering run that was never started.')
                exit()
            results = vf.cache[params]
            if results == None:
                ret = {'variants': False}
            else:
                ret = {'variants':results['variants'], 'scores':results['scores'], 'clusters':results['clusters'], 'variant_distance':results['variant_distance'], 'max_variant_distance':max(results['variant_distance'].values())}
            return json.dumps(ret)
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
        s_id = self.generate_session_id()
        vf = VariantFinder(tree_data, tree_format='newick', verbose=self.verbose)
        vf.available = available
        vf.ignored = ignored
        vf.distance_scale = distance_scale
        self.connections.new_session(s_id)
        self.sessions[s_id] = vf
        return s_id
    def add_variant_finder(self, vfinder):
        s_id = self.generate_session_id()
        self.connections.new_session(s_id)
        self.sessions[s_id] = vfinder
        return s_id

    # # # # #  Running the server  # # # # #
    def start_server(self):
        if self.web_server:
            return False # Only used for local version.
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
        s_id = request.form['session_id']
        b_id = request.form['browser_id']
        if s_id == self.local_input_session_id:
            return None, s_id, b_id, 'session ID is local input page'
        elif s_id in self.sessions:
            return self.sessions[s_id], s_id, b_id, 'session ID is valid.'
        else:
            return None, None, b_id, ("error, invalid session ID %s." % s_id, 559)
    def generate_session_id(self):
        # Javascript has issues parsing a number if the string begins with a non-significant zero.
        s_id = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        while s_id in self.sessions or s_id[0] == '0':
            s_id = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        return s_id
    def get_vf_data_dict(self, s_id):
        vf = self.sessions[s_id]
        return {'session_id':s_id, 'leaves':vf.leaves, 'chosen':sorted(vf.chosen), 'available':sorted(vf.available), 'ignored':sorted(vf.ignored), 'phyloxml_data':vf.phylo_xml_data}
    def update_or_copy_vf(self, s_id):
        """If any of the chosen, available, or ignored attributes have been modified, a new VariantFinder is generated with a new session ID. The javascript should switch to start maintaining this new session ID. The chosen and ignored attributes must first be cleared of their original values before being set."""
        # javascript returns an array of unicodes, not strs. But these seem to work interchangeably for some reason. If they don't probably just .encode('UTF-8') on each to convert it.
        vf = self.sessions[s_id]
        chsn = set(request.form.getlist('chosen[]'))
        ignrd = set(request.form.getlist('ignored[]'))
        avail = set(request.form.getlist('available[]'))
        if chsn != vf.chosen or ignrd != vf.ignored or avail != vf.available:
            vf = vf.copy()
            vf.chosen = []; vf.ignored = []; vf.available = []
            vf.chosen = chsn; vf.ignored = ignrd; vf.available = avail
            return self.add_variant_finder(vf)
        else:
            return s_id

    # # #  Server maintainence  # # #
    def collect_garbage(self):
        self.connections.clean_dead()
        for s_id in self.sessions.keys():
            if self.connections.is_dead(s_id):
                del self.sessions[s_id]
        if not self.web_server: # if personal server with no live instances.
            if self.connections.all_dead():
                print('Last Repvar instance closed, shutting down server.')
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

class ConnectionManager(object):
    """New instances that do exist but have not yet been maintained are identified by self.session_connections[s_id] = None. This should only happen when a new VariantFinder is instanciated."""
    def __init__(self, allowed_wait, local_input_session_id, web_server):
        self.allowed_wait = allowed_wait
        self.local_input_session_id = local_input_session_id
        self.session_connections = {}
        self.lock = threading.Lock()
        self.local_input_dead = web_server
        self.local_input_maintained = None # None means it hasn't been maintained yet, False means it's been closed or timed out. Otherwise is a time.

    def new_session(self, session_id):
        with self.lock:
            if session_id in self.session_connections:
                print('Error: something weird. A new session was added to the connection manager that already existed.')
                exit()
            if self.local_input_dead != True:
                self.local_input_maintained = False
                self.local_input_dead = True
            self.session_connections[session_id] = None

    def maintain(self, session_id, browser_id):
        with self.lock:
            if session_id == self.local_input_session_id:
                self.local_input_maintained = time.time()
            elif self.session_connections.get(session_id, None) == None:
                self.session_connections[session_id] = {browser_id: time.time()}
            else:
                self.session_connections[session_id][browser_id] = time.time()

    def close(self, session_id, browser_id):
        with self.lock:
            if session_id == self.local_input_session_id:
                self.local_input_maintained = False
                self.local_input_dead = True
            elif session_id in self.session_connections:
                if self.session_connections[session_id] == None:
                    del self.session_connections[session_id]
                else:
                    if browser_id in self.session_connections[session_id]:
                        del self.session_connections[session_id][browser_id]
                    if len(self.session_connections[session_id]) == 0:
                        del self.session_connections[session_id]

    def is_dead(self, session_id):
        """Assumes self.clean_dead has just been called, and so does not check if the connections are live again. If a new VariantFinder has just been created, but not yet maintained, this returns False."""
        if session_id == self.local_input_session_id:
            return self.local_input_dead
        elif session_id in self.session_connections:
            return False
        return True

    def all_dead(self):
        """Returns False if any connections are live, True if none are. Does not check for timed out connections."""
        if len(self.session_connections) > 0 or not self.local_input_dead:
            return False
        return True

    def clean_dead(self):
        """Removes any browserIDs that have timed out, and then any sessionIDs that no longer have any live browserIDs."""
        with self.lock:
            cur_time = time.time()
            if self.local_input_maintained and cur_time - self.local_input_maintained > self.allowed_wait:
                self.local_input_maintained = False
                self.local_input_dead = True
            s_ids_to_remove = []
            for s_id, connections in self.session_connections.items():
                if connections == None:
                    continue
                b_ids_to_remove = []
                for b_id, last_maintain in connections.items():
                    if cur_time - last_maintain > self.allowed_wait:
                        b_ids_to_remove.append(b_id)
                for b_id in b_ids_to_remove:
                    del self.session_connections[s_id][b_id]
                if len(self.session_connections[s_id]) == 0:
                    s_ids_to_remove.append(s_id)
            for s_id in s_ids_to_remove:
                del self.session_connections[s_id]
