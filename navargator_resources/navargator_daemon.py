import os, sys, time, threading
from collections import deque
from random import randint
from flask import Flask, request, render_template, json
from navargator_resources.variant_finder import VariantFinder, navargator_from_data
from navargator_resources.job_queue import JobQueue
from navargator_resources.phylo import PhyloParseError
from navargator_resources.navargator_common import NavargatorRuntimeError

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
# - It almost works with python 3, just need a few tweaks to finish. It's mostly loading nvrgtr files that's the problem


# BUG:
# - Looks like the daemon isn't shutting down when I close the web page for some reason. Sometimes. Especially when I run the program without a tree, load a tree, load a second tree, then close.
# - The instance closed for no apparent reason.
#   - Looking into it, it was because a time.time() call was sometimes returning a value ~15 sec too high. Then it just stopped happening. I'm guessing it was a vmware issue (as time.time is a pretty low-level function). Happened only once, I believe just after a system update.

class NavargatorDaemon(object):
    """Background daemon to serve NaVARgator requests.

      This class defines several custom HTTP status codes used to signal errors, which are also further defined in core.js:processError().
    550 - Specific error validating the user's tree.
    # # #  Re-number the below error codes to reasonable values:
    5505 - Error reading data from uploaded file. From the 2 upload functions.
    5506 - Attempting to access results that don't exist. From various, but should probably be just from a central get_results method.
    5507 - Error setting the normalization method. From set_normalization_method()
    5508 - Error, no session ID sent from the client. From get_instance().
    5509 - Error, no variant finder found for the session ID when one is expected. From calculate_global_normalization(), update_or_copy_vf().
    5510 - Error parsing tree file. From upload_tree_file() and upload_nvrgtr_file().
    5511 - Error manipulating tree object. From the rooting and re-ordering methods.
    """
    def __init__(self, server_port, threads=2, web_server=False, verbose=False):
        max_upload_size = 20*1024*1024 # 20 MB
        error_log_lines = 10000
        self.server_port = server_port
        self.web_server = web_server
        self.verbose = verbose
        self.sessions = {} # Holds the navargator instances, with session IDs as keys.
        self.job_queue = JobQueue(threads)
        if not web_server: # Running locally.
            self.sessionID_length = 5 # Length of the unique session ID used.
            self.check_interval = 3 # Repeatedly wait this many seconds between running server tasks.
            self.maintain_interval = 2 # Interval that the page sends a signal to maintain the navargator instance.
            allowed_wait = 60 # Wait seconds before timing out navargator instances.
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
        # # #  Setup tasks run after initialization:
        @self.server.before_first_request
        def setup_tasks():
            if self.web_server: # Setup tasks to start for the web version.
                t = threading.Thread(target=self.start_web_server)
                t.daemon = True
                t.start()
            else: # Setup tasks to begin for the local version.
                pass
        # # #  General server listening routes:
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
                return msg # Will almost certainly never actually be processed by the closing browser.
            elif s_id == '':
                return 'web server input closed'
            self.connections.close(s_id, b_id)
            if vf and self.connections.is_dead(s_id):
                del self.sessions[s_id]
            if not self.web_server and self.connections.all_dead():
                self.should_quit.set()
            return 'instance-closed successful.'
        @self.server.route(daemonURL('/get-basic-data'), methods=['POST'])
        def get_basic_data():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            data_dict = self.get_vf_data_dict(s_id)
            data_dict.update({'maintain_interval':self.maintain_interval})
            return json.dumps(data_dict)
        @self.server.route(daemonURL('/calculate-global-normalization'), methods=['POST'])
        def calculate_global_normalization():
            """For each set of params in the cache, gets the maximum distance from any variant to its cluster centre, and returns the largest of those. Used to normalize the tree graph and histogram so they can be compared between runs."""
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            elif vf == None:
                return ("error, global normalization cannot be calculated because there is no valid variant finder for session ID '%s'" % s_id, 5509)
            dist_scale = 1.0
            cur_var = request.json['cur_var']
            max_var_dist = float(request.json['max_var_dist'])
            bins = map(float, request.json['global_bins'])
            if not cur_var: # Called from input.js:calculateGlobalNormalization()
                var_nums = map(int, request.json['var_nums'])
                self.calc_global_normalization_values(var_nums, dist_scale, max_var_dist, bins, vf)
            else: # Called from results.js
                cur_var = int(cur_var)
                self.calc_global_normalization_values([cur_var], dist_scale, max_var_dist, bins, vf)
            ret = {'global_value':vf.normalize['global_value'], 'global_max_count':vf.normalize['global_max_count']}
            return json.dumps(ret)
        # # #  Input page listening routes:
        @self.server.route(daemonURL('/upload-tree-file'), methods=['POST'])
        def upload_tree_file():
            try:
                tree_data = request.files['upload-file'].read()
                tree_format = request.form['tree_format']
            except Exception as err:
                return (str(err), 5505)
            vf, s_id, b_id, msg = self.get_instance(json_data=False)
            if s_id == None:
                return msg
            try:
                new_s_id = self.new_variant_finder(tree_data, tree_format)
            except PhyloParseError as err:
                return (str(err), 5510)
            if s_id == self.local_input_session_id:
                self.connections.close(s_id, None)
            return json.dumps(self.get_vf_data_dict(new_s_id))
        @self.server.route(daemonURL('/upload-nvrgtr-file'), methods=['POST'])
        def upload_nvrgtr_file():
            try:
                nvrgtr_data = request.files['upload-file'].read()
            except Exception as err:
                return (str(err), 5505)
            vf, s_id, b_id, msg = self.get_instance(json_data=False)
            if s_id == None:
                return msg
            try:
                vf = navargator_from_data(nvrgtr_data.splitlines(), verbose=self.verbose)
            except PhyloParseError as err:
                return (str(err), 5510)
            new_s_id = self.add_variant_finder(vf)
            if s_id == self.local_input_session_id:
                self.connections.close(s_id, None) # Needed because that particular s_id never times out.
            return json.dumps(self.get_vf_data_dict(new_s_id))
        @self.server.route(daemonURL('/reroot-tree'), methods=['POST'])
        def reroot_tree():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            root_method = request.json['root_method']
            if root_method == 'midpoint':
                vf.root_midpoint()
            elif root_method == 'outgroup':
                selected_names = request.json['selected']
                if not selected_names:
                    return ("no outgroup selected.", 5511)
                try:
                    vf.root_outgroup(selected_names)
                except Exception as err:
                    return (str(err), 5511)
            return json.dumps(self.get_vf_data_dict(s_id))
        @self.server.route(daemonURL('/reorder-tree-nodes'), methods=['POST'])
        def reorder_tree_nodes():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            increasing = True if request.json['increasing'] == "true" else False
            vf.reorder_tree_nodes(increasing)
            return json.dumps(self.get_vf_data_dict(s_id))

        @self.server.route(daemonURL('/truncate-tree-names'), methods=['POST'])
        def truncate_tree_names():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            truncate_length = int(request.json['truncate_length'])
            vf.truncate_names(truncate_length)
            return json.dumps(self.get_vf_data_dict(s_id))

        @self.server.route(daemonURL('/save-tree-file'), methods=['POST'])
        def save_tree_file():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            tree_type = request.json['tree_type']
            if tree_type == 'newick':
                suffix = '.nwk'
            elif tree_type == 'nexus':
                suffix = '.nxs'
            elif tree_type == 'phyloxml' or tree_type == 'nexml':
                suffix = '.xml'
            if self.web_server:
                saved_locally = False
                tree_string = vf.get_tree_string(tree_type)
            else:
                root = tk_root()
                filename = saveAs(initialdir=os.getcwd(), initialfile='tree'+suffix, defaultextension=suffix)
                root.destroy()
                if filename:
                    vf.save_tree_file(filename, tree_type)
                saved_locally, tree_string = True, ''
            return json.dumps({'session_id':s_id, 'saved_locally':saved_locally, 'tree_string':tree_string, 'suffix':suffix})
        @self.server.route(daemonURL('/save-nvrgtr-file'), methods=['POST'])
        def save_nvrgtr_file():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            if self.web_server:
                saved_locally = False
                nvrgtr_str = vf.get_navargator_string()
            else:
                root = tk_root()
                filename = saveAs()
                root.destroy()
                if filename:
                    vf.save_navargator_file(filename)
                saved_locally, nvrgtr_str = True, ''
            return json.dumps({'session_id':s_id, 'saved_locally':saved_locally, 'nvrgtr_as_string':nvrgtr_str})
        @self.server.route(daemonURL('/find-variants'), methods=['POST'])
        def find_variants():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            num_vars = int(request.json['num_vars'])
            num_vars_range = int(request.json['num_vars_range'])
            cluster_method = request.json['cluster_method']
            dist_scale = 1.0
            for num in range(num_vars, num_vars_range + 1):
                params = (num, dist_scale)
                if params not in vf.cache:
                    vf.cache[params] = None
                    args = (num, dist_scale, cluster_method)
                    self.job_queue.addJob(vf.find_variants, args)
            return json.dumps({'session_id':s_id})
        @self.server.route(daemonURL('/check-results-done'), methods=['POST'])
        def check_results_done():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            elif vf == None:
                return ("error in check_results_done(), there is no valid variant finder for session ID '%s'" % s_id, 5509)
            var_nums = request.json['var_nums']
            var_scores, max_var_dists = [], []
            dist_scale = 1.0
            for num in var_nums:
                num = int(num)
                params = (num, dist_scale)
                if params not in vf.cache:
                    error_msg = 'Error: attempting to retrieve results for a clustering run that was never started.'
                    return (error_msg, 5506)
                results = vf.cache[params]
                if results == None:
                    var_scores.append(False)
                    max_var_dists.append(False)
                else:
                    var_scores.append(sum(results['scores']))
                    max_var_dists.append(results['max_distance'])
            return json.dumps({'var_nums':var_nums, 'var_scores':var_scores, 'max_var_dists':max_var_dists})
        @self.server.route(daemonURL('/set-normalization-method'), methods=['POST'])
        def set_normalization_method():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == '' or s_id == self.local_input_session_id:
                return "normalization cannot be set until a tree is loaded" # No error
            elif s_id == None:
                return msg
            elif vf == None:
                return ("error setting normalization method, there is no valid variant finder for session ID '%s'" % s_id, 5509)
            norm_method = request.json['normalization']['method']
            if norm_method == 'self':
                vf.normalize['method'] = 'self'
            elif norm_method == 'custom':
                vf.normalize['method'] = 'custom'
                vf.normalize['custom_value'] = float(request.json['normalization']['value'])
            elif norm_method == 'global':
                vf.normalize['method'] = 'global'
            else:
                err_msg = "Error: unrecognized normalization method '%s'" % norm_method
                return (err_msg, 5507)
            return "normalization method set to %s" % norm_method
        # # #  Results page listening routes:
        @self.server.route(daemonURL('/get-cluster-results'), methods=['POST'])
        def get_cluster_results():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            elif vf == None:
                return ("error in get_cluster_results(), there is no valid variant finder for session ID '%s'" % s_id, 5509)
            num_vars = int(request.json['num_vars'])
            dist_scale = 1.0
            params = (num_vars, dist_scale)
            if params not in vf.cache:
                error_msg = 'Error: attempting to retrieve results for a clustering run that was never started.'
                return (error_msg, 5506)
            results = vf.cache[params]
            if results == None:
                ret = {'variants': False}
            else:
                norm = {'method':vf.normalize['method'], 'value':results['max_distance'], 'max_count':0}
                if vf.normalize['method'] == 'global':
                    norm['value'] = vf.normalize['global_value']
                    norm['max_count'] = vf.normalize['global_max_count']
                elif vf.normalize['method'] == 'custom':
                    norm['value'] = vf.normalize['custom_value']
                    norm['max_count'] = vf.normalize['custom_max_count']
                ret = {'variants':results['variants'], 'scores':results['scores'], 'clusters':results['clusters'], 'variant_distance':results['variant_distance'], 'max_variant_distance':results['max_distance'], 'normalization':norm}
            return json.dumps(ret)
        # # #  Serving the pages locally
        @self.server.route('/input')
        def render_input_page():
            return render_template('input.html')
        @self.server.route('/results')
        def render_results_page():
            return render_template('results.html')
    # # # # #  Public methods  # # # # #
    def new_variant_finder(self, tree_data, tree_format, available=[], ignored=[], distance_scale=1.0):
        if type(tree_data) == bytes:
            tree_data = tree_data.decode()
        s_id = self.generate_session_id()
        vf = VariantFinder(tree_data, tree_format=tree_format, verbose=self.verbose)
        vf.available = available
        vf.ignored = ignored
        vf.distance_scale = distance_scale
        self.connections.new_session(s_id)
        self.sessions[s_id] = vf
        return s_id
    def add_variant_finder(self, vf):
        s_id = self.generate_session_id()
        self.connections.new_session(s_id)
        self.sessions[s_id] = vf
        return s_id

    # # # # #  Running the server  # # # # #
    def start_server(self):
        if self.web_server:
            return False # Only used for local version.
        olderr = sys.stderr
        sys.stderr = self.log_buffer
        t = threading.Thread(target=self.server.run,
            kwargs={'threaded':True, 'port':self.server_port})
        t.daemon = True
        t.start()
        try:
            while not self.should_quit.is_set():
                self.should_quit.wait(self.check_interval)
                self.parse_err_logs()
                self.collect_garbage()
            self.parse_err_logs()
            if self.error_occurred and self.verbose:
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

    # # # # #  Backend accession methods  # # # # #
    def get_instance(self, json_data=True, should_fail=False):
        """Returns vf_instance, session_id, browser_id, message. vf_instance will be None if there is no instance with that session_id. session_id can be a string of the s_id, a string of the local input s_id, '' for the web input page, or None if it was not sent or if it is not found. browser_id will be a string, or None if it was not sent. message will be a string if there were no issues, or a tuple (message, error_code) that can be returned and parsed by the client's javascript.
        HTTP status code 559 is used here to indicate a response was requested
        for a session ID that does not exist."""
        if should_fail: return None, None, None, ('DEBUG ONLY: Intentional fail.', 588)
        if json_data:
            s_id = request.json.get('session_id')
            b_id = request.json.get('browser_id')
        else:
            s_id = request.form.get('session_id', None)
            b_id = request.form.get('browser_id', None)
        if s_id == self.local_input_session_id:
            return None, s_id, b_id, 'session ID is local input page'
        elif s_id == '':
            return None, s_id, b_id, 'session ID is web input page'
        elif s_id in self.sessions:
            return self.sessions[s_id], s_id, b_id, 'session ID is valid.'
        elif s_id == None:
            return None, None, b_id, ("error, no session ID received from the client page", 5508)
        else:
            return None, None, b_id, ("error, invalid session ID %s." % s_id, 559)
    def update_or_copy_vf(self):
        """Called from save-nvrgtr-file and find-variants routes. If any of the chosen, available, or ignored attributes have been modified, a new VariantFinder is generated with a new session ID. The javascript should switch to start maintaining this new session ID. The chosen and ignored attributes must first be cleared of their original values before being set. Updates the display_opts dict of the vf instance."""
        vf, s_id, b_id, msg = self.get_instance()
        if s_id == None:
            return None, None, msg
        elif vf == None:
            return None, None, ("error in update_or_copy_vf, there is no valid variant finder for session ID '%s'" % s_id, 5509)
        chsn = set(request.json['chosen'])
        ignrd = set(request.json['ignored'])
        avail = set(request.json['available'])
        if chsn != vf.chosen or ignrd != vf.ignored or avail != vf.available:
            vf = vf.copy()
            vf.chosen = []; vf.ignored = []; vf.available = []
            vf.chosen = chsn; vf.ignored = ignrd; vf.available = avail
            s_id = self.add_variant_finder(vf)
            msg = "vf replaced; new session ID '%s'" % s_id
        vf.display_options = request.json.get('display_opts', {})
        return vf, s_id, msg
    # # # # #  Private methods  # # # # #
    def generate_session_id(self):
        # Javascript has issues parsing a number if the string begins with a non-significant zero.
        s_id = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        while s_id in self.sessions or s_id[0] == '0':
            s_id = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        return s_id
    def get_vf_data_dict(self, s_id):
        data_dict = {'session_id':s_id, 'leaves':[], 'chosen':[], 'available':[], 'ignored':[], 'phyloxml_data':'', 'display_opts':{}}
        vf = self.sessions.get(s_id)
        if vf != None:
            data_dict.update({'leaves':vf.leaves, 'chosen':sorted(vf.chosen), 'available':sorted(vf.available), 'ignored':sorted(vf.ignored), 'phyloxml_data':vf.phyloxml_tree_data, 'display_opts':vf.display_options})
        return data_dict
    def calc_global_normalization_values(self, var_nums, dist_scale, max_var_dist, bins, vf):
        if vf.normalize['global_value'] == None or max_var_dist >= vf.normalize['global_value']:
            vf.normalize['global_value'] = max_var_dist
            if bins != vf.normalize['global_bins']:
                vf.normalize['global_bins'] = bins
                vf.normalize['global_nums'] = set()
                vf.normalize['global_max_count'] = 0
        elif max_var_dist < vf.normalize['global_value']:
            bins = vf.normalize['global_bins']
        max_count = vf.normalize['global_max_count'] or 0
        for num in var_nums:
            params = (num, dist_scale)
            if num in vf.normalize['global_nums'] or vf.cache[params] == None:
                continue # Already been processed, or clustering is still in progress
            count = self.calculate_max_histo_count(vf.cache[params]['variant_distance'], num, bins)
            if count > max_count:
                max_count = count
            vf.normalize['global_nums'].add(num)
        vf.normalize['global_max_count'] = max_count
    def calculate_max_histo_count(self, var_dists, var_num, bins):
        dists = sorted(var_dists.values())[var_num:]
        max_count = var_num
        dists_ind = 0
        for threshold in bins[2:]: # bins[0] is negative (for chosen variants), bins[1] is zero.
            count = 0
            for d in dists[dists_ind:]:
                if d < threshold:
                    count += 1
                else:
                    break
            if count > max_count:
                max_count = count
            dists_ind += count
        return max_count

    # # #  Server maintainence  # # #
    def collect_garbage(self):
        self.connections.clean_dead()
        for s_id in self.sessions.keys():
            if self.connections.is_dead(s_id):
                del self.sessions[s_id]
        if not self.web_server: # if personal server with no live instances.
            if self.connections.all_dead():
                print('Last NaVARgator instance closed, shutting down server.')
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
                raise NavargatorRuntimeError('Error: something weird happened. A new session was added to the connection manager that already existed.')
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
