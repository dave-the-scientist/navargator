import os, sys, time, threading
from collections import deque
from random import randint
from flask import Flask, request, render_template, json
from repvar_resources.variant_finder import VariantFinder

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
    """Prefix added to the routes that should only ever be called by the page itself, not people. Doesn't really matter what the prefix is, but it must match that used by the daemonURL function in the page's javascript."""
    return '/daemon' + url

class RepvarDaemon(object):
    """Background daemon to server repvar requests.

      This class defines several custom HTTP status codes used to signal errors:
    550 - Specific error validating the user's tree.
    """
    def __init__(self, server_port, web_server=False, instance_timeout_inf=False, verbose=False):
        max_upload_size = 20*1024*1024 # 20 MB
        error_log_lines = 10000
        self.server_port = server_port
        self.web_server = web_server
        self.verbose = verbose
        self.sessions = {} # Holds the repvar instances, with session IDs as keys.
        if not web_server: # Running locally.
            self.sessionID_length = 5 # Length of the unique session ID used.
            self.check_interval = 3 # Repeatedly wait this many seconds between running server tasks.
            self.maintain_wait = 2 # Interval that the page sends a signal to maintain the repvar instance.
            self.allowed_wait = {'after_instance':300, 'page_load':300, 'between_checks':10} # Waits before timing out repvar instances.
            if instance_timeout_inf:
                self.allowed_wait['page_load'] = float('inf')
        else: # Live, hosted web server.
            self.sessionID_length = 20
            self.check_interval = 10
            self.maintain_wait = 9
            self.allowed_wait = {'after_instance':120, 'page_load':300, 'between_checks':30}
        # # #  Activity and error logging:
        self.local_input_id = 'local_input_page' # Should match setupPage in input.js
        self.local_input_last_maintain = None
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
        # # #  Server listening routes:
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
        @self.server.route(daemonURL('/upload-newick-tree'), methods=['POST'])
        def upload_newick_tree():
            try:
                tree_data = request.files['upload-file'].read()
            except Exception as err:
                return (str(err), 552)
            print 'tree data read'
            print tree_data
            return json.dumps({'some var':'some val', 'a num':42})

        # #  Serving the pages locally
        @self.server.route('/input')
        def render_input_page():
            return render_template('input.html')
    # # # # #  Public methods  # # # # #
    def new_instance(self, tree_data, available=[], ignored=[], distance_scale=1.0):
        if type(tree_data) == bytes:
            tree_data = tree_data.decode()
        idnum = self.generateSessionID()
        vf = VariantFinder(tree_data, tree_format='newick', tree_is_string=True, allowed_wait=self.allowed_wait, verbose=True) # TEST verbose=False
        vf.available = available
        vf.ignored = ignored
        vf.distance_scale = distance_scale
        self.sessions[idnum] = vf
        return idnum
    def process_instance(self, idnum, num_variants, method=None, distance_scale=None, bootstraps=10):
        self.sessions[idnum].processed(num_variants, method=method, distance_scale=distance_scale, bootstraps=bootstraps)
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
        idnum = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        while idnum in self.sessions:
            idnum = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        return idnum
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
            if self.local_input_last_maintain != None and \
            time.time() - self.local_input_last_maintain > self.allowed_wait['between_checks']:
                self.local_input_last_maintain = None
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
