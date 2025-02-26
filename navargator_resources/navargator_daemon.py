import os, sys, time, threading
from collections import deque
from random import randint
from flask import Flask, request, render_template, json, cli
from navargator_resources.variant_finder import VariantFinder, navargator_from_data
from navargator_resources.curve_fitting import fit_to_sigmoid
from navargator_resources.job_queue import JobQueue
from navargator_resources.phylo import PhyloParseError, PhyloUniqueNameError
from navargator_resources.navargator_common import NavargatorError, NavargatorRuntimeError, NavargatorValidationError, NavargatorCapacityError

if sys.version_info >= (3,0): # Python 3.x imports
    from io import StringIO
    try:
        from tkinter import Tk as tk_root
        from tkinter.filedialog import asksaveasfilename as saveAs
    except ImportError:
        saveAs = None # Files will just be saved in the browser's default download location.
    def as_string(_string):
        return str(_string, 'utf-8')
elif sys.version_info >= (2,6): # Python 2.x imports
    try:
        from cStringIO import StringIO
    except ImportError:
        from StringIO import StringIO
    try:
        from Tkinter import Tk as tk_root
        from tkFileDialog import asksaveasfilename as saveAs
    except ImportError:
        saveAs = None
    def as_string(_string):
        return _string
else:
    print('\nError: Navargator requires Python version >= 2.6 to run.\n')
    exit()


# TODO:
# - Some kind of 'calculating' attribute for a vfinder instance. Does nothing on local, but for server allows it to kill jobs that have been calculating for too long (I think I can kill threads in JobQueue).
# - Probably a good idea to have js fetch local_input_session_id and input_browser_id from this, instead of relying on them matching.
# - Logging should be saved to file, at least for the web server. Both errors as well as requests for diagnostic reports (in get_connections_report()).


# BUG:
# QT greedy is generating a new runID for the same set of parameters (at least for test_tree_487.nvrgtr @0.1); probably an issue in process_args_for_find_variants()

# NOTES:
# Negative branches are first balanced, or failing that are set to 0. Isn't great for the clustering or several display features to have negative distances.


# This suppresses: "WARNING: This is a development server. Do not use it in a production deployment."
cli.show_server_banner = lambda *_: None

class NavargatorDaemon(object):
    """Background daemon to serve Navargator requests.

      This class defines several custom HTTP status codes used to signal errors, which are also further defined in core.js:processError().
    550 - Specific error validating the user's tree.
    # # #  Re-number the below error codes to reasonable values:
    5505 - Error reading data from uploaded file. From the 2 upload functions.
    5506 - Attempting to access results that don't exist. From various, but should probably be just from a central get_results method.
    5507 - Error setting the normalization method. From set_normalization_method()
    5508 - Error, no session ID sent from the client. From get_instance().
    5509 - Error, no variant finder found for the session ID when one is expected. From calculate_global_normalization(), update_or_copy_vf().
    5510 - Error parsing tree file. From upload_tree_file().
    5511 - Error manipulating tree object. From the rooting and re-ordering methods.
    5512 - Error truncating tree names because names became non-unique. From truncate_tree_names().
    5513 - Error creating a new session as the server is at capacity. Likely from upload_tree_file(), rarely from anything that calls update_or_copy_vf().
    5514 - Error parsing data from the client.
    5515 - Error clustering the tree.
    """
    def __init__(self, server_port, threads=2, web_server=False, verbose=False):
        self.sessionID_length = 20 # Length of the unique session ID used
        self.check_interval = 30 # Garbage collection interval on server
        self.maintain_interval = 30 # Interval the client sends a signal to maintain the session
        self.server_port = server_port
        self.web_server = web_server
        self.verbose = verbose
        self.sessions = {} # Holds the navargator instances, with session IDs as keys.
        self.job_queue = JobQueue(threads)
        # # #  Options to secure the server:
        max_upload_size = 1024*1024 * 20 # 20 MB; maximum allowed upload file size
        inactive_time = 3600 # Seconds of inactivity before sessions time out (server only)
        inactive_num = 100 # Number of sessions allowed before inactive_time is used (server only)
        max_sessions = 200 # The hard cap on the number of concurrent sessions (server only)
        # # #  Server activity and error logging:
        self.local_input_session_id = 'local_input_page' # Should match setupPage in input.js
        self.connections = ConnectionManager(self.local_input_session_id, web_server, inactive_time, inactive_num, max_sessions)
        self.should_quit = threading.Event()
        self.buff_lock = threading.Lock()
        self.log_buffer = StringIO()
        self.error_log = deque([], 10000)
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
        @self.server.route(self.daemonURL('/maintain-server'), methods=['POST'])
        def maintain_server():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            self.connections.maintain(s_id, b_id)
            return 'maintain-server successful.'
        @self.server.route(self.daemonURL('/instance-closed'), methods=['POST'])
        def instance_closed():
            vf, s_id, b_id, msg = self.get_instance(json_data=False)
            if s_id == None:
                return msg # Will almost certainly never actually be processed by the closing browser.
            elif s_id == '':
                return 'web server input closed before uploading'
            self.connections.close(s_id, b_id)
            if vf and self.connections.is_dead(s_id):
                del self.sessions[s_id]
            if not self.web_server and self.connections.all_dead():
                self.should_quit.set()
            return 'instance-closed successful.'
        @self.server.route(self.daemonURL('/get-basic-data'), methods=['POST'])
        def get_basic_data():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            data_dict = self.get_vf_data_dict(s_id)
            return json.dumps(data_dict)
        @self.server.route(self.daemonURL('/calculate-global-normalization'), methods=['POST'])
        def calculate_global_normalization():
            """For each set of params in the cache, gets the maximum distance from any variant to its cluster centre, and returns the largest of those. Used to normalize the tree graph and histogram so they can be compared between runs."""
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            elif vf == None:
                return ("error, global normalization cannot be calculated because there is no valid variant finder for session ID '{}'".format(s_id), 5509)
            run_ids = request.json['run_ids']
            max_var_dist = float(request.json['max_var_dist'])
            bins = list(map(float, request.json['global_bins']))
            self.calc_global_normalization_values(run_ids, max_var_dist, bins, vf)
            ret = {'global_value':vf.normalize['global_value'], 'global_max_count':vf.normalize['global_max_count']}
            return json.dumps(ret)
        @self.server.route(self.daemonURL('/fit-curve'), methods=['POST'])
        def fit_curve():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            try:
                data = request.json['data']
            except Exception as err:
                return ("could not get the data for fit_curve() from the client.", 5514)
            try:
                max_val = float(request.json['max_val'])
                if max_val <= 0:
                    max_val = None
            except:
                max_val = None
            norm_batches = request.json['norm_batches']

            # TESTING
            print('norm is', norm_batches)
            norm_batches = False
            
            if not norm_batches:
                xvals, yvals = [], []
                for datum in data:
                    name1 = datum.get('name1')
                    name2 = datum.get('name2')
                    if name1 not in vf.leaves or name2 not in vf.leaves:
                        return ("malformed data for fit_curve() from the client.", 5514)
                    dist = vf.orig_dists[vf.index[name1], vf.index[name2]]
                    datum['distance'] = dist
                    xvals.append(dist)
                    yvals.append(float(datum['value']))
                b, r, m = fit_to_sigmoid(xvals, yvals, r_value=max_val)
                ret = {'data':data, 'b':b, 'r':r, 'm':m}
            else:
                print('do batch normalization')
            return json.dumps(ret)
        @self.server.route(self.daemonURL('/get-distances'), methods=['POST'])
        def get_distances():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            selected_vars = request.json['selected_vars']
            if len(selected_vars) < 2:
                return ('must select at least 2 variants to get distances.', 5514)
            name1 = selected_vars[0]
            distances = [vf.get_distance(name1, name2) for name2 in selected_vars[1:]]
            return json.dumps({'distances':distances})
        @self.server.route(self.daemonURL('/get-pairwise-distances'), methods=['POST'])
        def get_pairwise_distances():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            variant_pairs = request.json['variant_pairs']
            distances = [vf.get_distance(name1, name2) for (name1,name2) in variant_pairs]
            return json.dumps({'distances':distances})
        # # #  Input page listening routes:
        @self.server.route(self.daemonURL('/upload-tree-file'), methods=['POST'])
        def upload_tree_file():
            try:
                file_data = as_string(request.files['upload-file'].read())
                file_format = request.form['tree_format']
                file_name = request.form['file_name']
            except Exception as err:
                return (str(err), 5505)
            vf, s_id, b_id, msg = self.get_instance(json_data=False)
            if s_id == None:
                return msg
            try:
                if file_format == 'nvrgtr':
                    vf = navargator_from_data(file_data.splitlines(), file_name=file_name, verbose=self.verbose)
                    new_s_id = self.add_variant_finder(vf, browser_id=b_id)
                else:
                    new_s_id = self.new_variant_finder(file_data, file_format, file_name=file_name, browser_id=b_id)
            except NavargatorValidationError as err:
                return (str(err), 5505)
            except NavargatorCapacityError as err:
                return (str(err), 5513)
            except PhyloParseError as err:
                return (str(err), 5510)
            except NavargatorError as err:
                return (str(err), 5510)
            if s_id != '': # It's '' only from the input page on the web server.
                self.connections.close(s_id, b_id) # Since the new session was created successfully.
            return json.dumps(self.get_vf_data_dict(new_s_id))
        @self.server.route(self.daemonURL('/reroot-tree'), methods=['POST'])
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
        @self.server.route(self.daemonURL('/reorder-tree-nodes'), methods=['POST'])
        def reorder_tree_nodes():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            increasing = True if request.json['increasing'] == "true" else False
            vf.reorder_tree_nodes(increasing)
            return json.dumps(self.get_vf_data_dict(s_id))
        @self.server.route(self.daemonURL('/truncate-tree-names'), methods=['POST'])
        def truncate_tree_names():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            truncate_length = int(request.json['truncate_length'])
            try:
                vf.truncate_names(truncate_length)
            except PhyloUniqueNameError as err:
                return (str(err), 5512)
            return json.dumps(self.get_vf_data_dict(s_id))
        @self.server.route(self.daemonURL('/save-tree-file'), methods=['POST'])
        def save_tree_file():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            tree_type = request.json['tree_type']
            if tree_type == 'newick':
                suffix = 'nwk'
            elif tree_type == 'nexus':
                suffix = 'nxs'
            elif tree_type == 'phyloxml' or tree_type == 'nexml':
                suffix = 'xml'
            default_filename = 'navargator_tree.{}'.format(suffix)
            tree_string = vf.get_tree_string(vf.tree, tree_type)
            if saveAs and self.web_server == False:
                root = tk_root()
                root.withdraw()
                filename = saveAs(initialdir=os.getcwd(), initialfile=default_filename)
                root.destroy()
                if filename:
                    vf.save_tree_file(filename, tree_string)
                saved_locally, tree_string = True, ''
            else:
                saved_locally = False
            return json.dumps({'session_id':s_id, 'saved_locally':saved_locally, 'tree_string':tree_string, 'filename':default_filename})
        @self.server.route(self.daemonURL('/save-subtree-file'), methods=['POST'])
        def save_subtree_file():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            tree_type = request.json['tree_type']
            if tree_type == 'newick':
                suffix = 'nwk'
            elif tree_type == 'nexus':
                suffix = 'nxs'
            elif tree_type == 'phyloxml' or tree_type == 'nexml':
                suffix = 'xml'
            default_filename = 'navargator_subtree.{}'.format(suffix)
            selected_vars = request.json['selected_vars']
            subtree = vf.tree.get_subtree(selected_vars, keep_root_branch=False)
            subtree_string = vf.get_tree_string(subtree, tree_type)
            if saveAs and self.web_server == False:
                root = tk_root()
                root.withdraw()
                filename = saveAs(initialdir=os.getcwd(), initialfile=default_filename)
                root.destroy()
                if filename:
                    vf.save_tree_file(filename, subtree_string)
                saved_locally, subtree_string = True, ''
            else:
                saved_locally = False
            return json.dumps({'session_id':s_id, 'saved_locally':saved_locally, 'tree_string':subtree_string, 'filename':default_filename})
        @self.server.route(self.daemonURL('/save-nvrgtr-file'), methods=['POST'])
        def save_nvrgtr_file():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            default_filename = 'navargator_session.nvrgtr'
            include_distances = request.json['include_distances']
            if saveAs and self.web_server == False:
                root = tk_root()
                root.withdraw()
                filename = saveAs(initialdir=os.getcwd(), initialfile=default_filename)
                root.destroy()
                if filename:
                    vf.save_navargator_file(filename, include_distances=include_distances)
                saved_locally, nvrgtr_str = True, ''
            else:
                saved_locally = False
                nvrgtr_str = vf.get_navargator_string(include_distances=include_distances)
            return json.dumps({'session_id':s_id, 'saved_locally':saved_locally, 'nvrgtr_as_string':nvrgtr_str, 'filename':default_filename}, ensure_ascii=False)
        @self.server.route(self.daemonURL('/find-variants'), methods=['POST'])
        def find_variants():
            vf, s_id, msg = self.update_or_copy_vf()
            if s_id == None:
                return msg
            cluster_method = request.json['cluster_method']
            arg_list = request.json['args']
            run_ids, run_descrs, run_tooltips = [], [], []
            if cluster_method in vf.k_cluster_methods:
                num_vars, num_vars_range, tolerance = arg_list[1:4]
                for num in range(num_vars, num_vars_range + 1):
                    params = (num, tolerance)
                    run_id, args, run_descr, run_tooltip, to_run_clustering = self.process_args_for_find_variants(vf, cluster_method, params, arg_list)
                    if to_run_clustering:
                        self.job_queue.addJob(vf.find_variants, args)
                        #vf.find_variants(*args) # DEV: For bug tracking
                    run_ids.append(run_id)
                    run_descrs.append(run_descr)
                    run_tooltips.append(run_tooltip)
            elif cluster_method in vf.threshold_cluster_methods:
                thresh, percent = arg_list[1:3]
                params = (thresh, percent)
                run_id, args, run_descr, run_tooltip, to_run_clustering = self.process_args_for_find_variants(vf, cluster_method, params, arg_list)
                if to_run_clustering:
                    self.job_queue.addJob(vf.find_variants, args)
                    #vf.find_variants(*args) # DEV: For bug tracking
                run_ids = [run_id]
                run_descrs = [run_descr]
                run_tooltips = [run_tooltip]
            else:
                return ("error clustering, method '{}' not recognized for session ID '{}'".format(cluster_method, s_id), 5515)
            return json.dumps({'session_id':s_id, 'run_ids':run_ids, 'descriptions':run_descrs, 'tooltips':run_tooltips})
        @self.server.route(self.daemonURL('/quit-clustering-run'), methods=['POST'])
        def quit_clustering_run():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            run_id = request.json['run_id']
            vf.cache[run_id]['quit_now'] = True
            print('called quit for', run_id)
            return 'quitting clustering run {}'.format(run_id)
        @self.server.route(self.daemonURL('/check-results-done'), methods=['POST'])
        def check_results_done():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            elif vf == None:
                return ("error in check_results_done(), there is no valid variant finder for session ID '{}'".format(s_id), 5509)
            run_ids = request.json['run_ids']
            scores, num_clusts, max_dists = [], [], []
            for run_id in run_ids:
                if run_id not in vf.cache:
                    error_msg = 'Error: attempting to retrieve results for a clustering run that was never started.'
                    return (error_msg, 5506)
                results = vf.cache[run_id]
                if results['status'] == 'running':
                    scores.append(False) # Used to signal that processing is ongoing.
                    num_clusts.append(results['cycles_used'])
                    max_dists.append(False)
                elif results['status'] == 'error':
                    scores.append('error') # Used to signal that the run finished in error.
                    num_clusts.append(results['error_message'])
                    max_dists.append(False)
                elif results['status'] == 'done':
                    scores.append(sum(results['scores']))
                    num_clusts.append(len(results['scores']))
                    max_dists.append(results['max_distance'])
                else:
                    raise NavargatorRuntimeError('Error: unknown status code "{}" in check_results_done()'.format(results['status']))
            return json.dumps({'run_ids':run_ids, 'scores':scores, 'num_clusts':num_clusts, 'max_dists':max_dists})
        @self.server.route(self.daemonURL('/update-visual-options'), methods=['POST'])
        def update_visual_options():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            vf.display_options = request.json['display_opts']
            vf.selection_groups_order = request.json['selection_groups_order']
            vf.selection_groups_data = request.json['selection_groups_data']
            return "display options updated for {}".format(s_id)
        @self.server.route(self.daemonURL('/kill-clustering-run'), methods=['POST'])
        def kill_clustering_run():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            run_id = request.json['run_id']
            vf.cache[run_id]['quit_now'] = True
            return "killed clusting run '{}' from sessionID {}".format(s_id, run_id)
        @self.server.route(self.daemonURL('/set-normalization-method'), methods=['POST'])
        def set_normalization_method():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == '' or s_id == self.local_input_session_id:
                return "normalization cannot be set until a tree is loaded" # No error
            elif s_id == None:
                return msg
            elif vf == None:
                return ("error setting normalization method, there is no valid variant finder for session ID '{}'".format(s_id), 5509)
            norm_method = request.json['normalization']['method']
            if norm_method == 'self':
                vf.normalize['method'] = 'self'
            elif norm_method == 'custom':
                vf.normalize['method'] = 'custom'
                vf.normalize['custom_value'] = float(request.json['normalization']['value'])
            elif norm_method == 'global':
                vf.normalize['method'] = 'global'
            else:
                err_msg = "Error: unrecognized normalization method '{}'".format(norm_method)
                return (err_msg, 5507)
            return "normalization method set to {}".format(norm_method)
        # # #  Results page listening routes:
        @self.server.route(self.daemonURL('/get-cluster-results'), methods=['POST'])
        def get_cluster_results():
            vf, s_id, b_id, msg = self.get_instance()
            if s_id == None:
                return msg
            elif vf == None:
                return ("error in get_cluster_results(), there is no valid variant finder for session ID '{}'".format(s_id), 5509)
            run_id = request.json['run_id']
            if run_id not in vf.cache:
                error_msg = 'Error: attempting to retrieve results for a clustering run that was never started.'
                return (error_msg, 5506)
            results = vf.cache[run_id]
            if results['status'] == 'running':
                ret = {'variants':False}
            elif results['status'] == 'error':
                ret = {'variants':'error', 'error_message':results['error_message']}
            elif results['status'] == 'done':
                norm = {'method':vf.normalize['method'], 'value':results['max_distance'], 'max_count':0}
                if vf.normalize['method'] == 'global':
                    norm['value'] = vf.normalize['global_value']
                    norm['max_count'] = vf.normalize['global_max_count']
                elif vf.normalize['method'] == 'custom':
                    norm['value'] = vf.normalize['custom_value']
                    norm['max_count'] = vf.normalize['custom_max_count']
                ret = {'variants':results['variants'], 'scores':results['scores'], 'clusters':results['clusters'], 'variant_distance':results['variant_distance'], 'max_variant_distance':results['max_distance'], 'normalization':norm}
            else:
                raise NavargatorRuntimeError('Error: unknown status code "{}" in get_cluster_results()'.format(results['status']))
            return json.dumps(ret)
        # # #  Serving the pages locally
        @self.server.route('/input')
        def render_input_page():
            return render_template('input.html')
        @self.server.route('/results')
        def render_results_page():
            return render_template('results.html')
        # # #  Diagnostics function
        @self.server.route(self.daemonURL('/get-connections-report'), methods=['POST'])
        def get_connections_report():
            s_id = request.json.get('session_id')
            b_id = request.json.get('browser_id') # Log these?
            t0 = time.time()
            active = []
            for s, bs in self.connections.session_connections.items():
                num_leaves = len(self.sessions[s].leaves)
                num_params = len(self.sessions[s].cache)
                ages = []
                for t in bs.values():
                    ages.append(t0 - t)
                active.append({'ages':ages, 'num_leaves':num_leaves, 'num_params':num_params})
            return json.dumps(active)

    # # # # #  Public methods  # # # # #
    def new_variant_finder(self, tree_data, tree_format, file_name='unknown file', browser_id='unknown', available=[], ignored=[]):
        if type(tree_data) == bytes:
            tree_data = tree_data.decode()
        vf = VariantFinder(tree_data, tree_format=tree_format, file_name=file_name, verbose=self.verbose)
        vf.available = vf.leaves # By default
        return self.add_variant_finder(vf, browser_id)
    def add_variant_finder(self, vf, browser_id='unknown'):
        s_id = self.generate_session_id()
        self.connections.new_session(s_id, browser_id)
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
            return None, None, b_id, ("error, invalid session ID {}.".format(s_id), 559)
    def update_or_copy_vf(self):
        """Called from save-nvrgtr-file and find-variants routes. If any of the chosen, available, or ignored attributes have been modified, a new VariantFinder is generated with a new session ID. The javascript should switch to start maintaining this new session ID. Updates the display_opts dict, the selection_groups_order and selection_groups_data of the vf instance. Functions that call this should all check if s_id is None, and if so return msg to the client, which will cause an error popup on the page."""
        vf, s_id, b_id, msg = self.get_instance()
        if s_id == None:
            return None, None, msg
        elif vf == None:
            return None, None, ("error in update_or_copy_vf, there is no valid variant finder for session ID '{}'".format(s_id), 5509)
        chsn = set(request.json['chosen'])
        ignrd = set(request.json['ignored'])
        avail = set(request.json['available'])
        if chsn != vf.chosen or ignrd != vf.ignored or avail != vf.available:
            vf = vf.copy()
            vf.chosen = []; vf.ignored = []; vf.available = []
            vf.chosen = chsn; vf.ignored = ignrd; vf.available = avail
            try:
                s_id = self.add_variant_finder(vf, browser_id=b_id)
            except NavargatorCapacityError as err:
                return None, None, (str(err), 5513)
            msg = "vf replaced; new session ID '{}'".format(s_id)
        vf.display_options = request.json.get('display_opts', {})
        vf.selection_groups_order = request.json.get('selection_groups_order', [])
        vf.selection_groups_data = request.json.get('selection_groups_data', {})
        return vf, s_id, msg

    # # # # #  Private methods  # # # # #
    def daemonURL(self, url):
        """Prefix added to the routes that should only ever be called by the page itself. Doesn't really matter what the prefix is, but it must match that used by the daemonURL function in core.js.
        IMPORTANT: When you configure Apache2 that all '/daemon' URLs should be processed by WSGI, it cuts off the '/daemon' part when passing the requests. NGINX does not, so if deployed with that the return here should be the same as for the local version."""
        if self.web_server:
            return url
        else:
            return '/daemon' + url
    def generate_session_id(self):
        # Javascript has issues parsing a number if the string begins with a non-significant zero.
        s_id = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        while s_id in self.sessions or s_id[0] == '0':
            s_id = ''.join([str(randint(0,9)) for i in range(self.sessionID_length)])
        return s_id
    def get_vf_data_dict(self, s_id):
        data_dict = {'session_id':s_id, 'leaves':[], 'ordered_names':[], 'chosen':[], 'available':[], 'ignored':[], 'phyloxml_data':'', 'display_opts':{}, 'selection_groups_order':[], 'selection_groups_data':{}, 'file_name':'unknown file', 'max_root_distance':0.0, 'maintain_interval':self.maintain_interval}
        vf = self.sessions.get(s_id)
        if vf != None:
            data_dict.update({'leaves':vf.leaves, 'ordered_names':vf.ordered_names, 'chosen':sorted(vf.chosen), 'available':sorted(vf.available), 'ignored':sorted(vf.ignored), 'phyloxml_data':vf.phyloxml_tree_data, 'display_opts':vf.display_options, 'selection_groups_order':vf.selection_groups_order, 'selection_groups_data':vf.selection_groups_data, 'file_name':vf.file_name, 'max_root_distance':vf.max_root_distance})
        return data_dict
    def calc_global_normalization_values(self, run_ids, max_var_dist, bins, vf):
        if vf.normalize['global_value'] == None or max_var_dist >= vf.normalize['global_value']:
            vf.normalize['global_value'] = max_var_dist
            if bins != vf.normalize['global_bins']:
                vf.normalize['global_bins'] = bins
                vf.normalize['processed'] = set()
                vf.normalize['global_max_count'] = 0
        elif max_var_dist < vf.normalize['global_value']:
            bins = vf.normalize['global_bins']
        max_count = vf.normalize['global_max_count'] or 0
        for run_id in run_ids:
            if run_id in vf.normalize['processed'] or vf.cache[run_id]['status'] in ('running', 'error'):
                continue # Already processed or still clustering or error in run
            var_dists, num_clusts = vf.cache[run_id]['variant_distance'], len(vf.cache[run_id]['scores'])
            count = self.calculate_max_histo_count(var_dists, num_clusts, bins)
            if count > max_count:
                max_count = count
            vf.normalize['processed'].add(run_id)
        vf.normalize['global_max_count'] = max_count
    def calculate_max_histo_count(self, var_dists, num_clusts, bins):
        """Counts the frequency of each bin for the given distances, returns the largest."""
        dists = sorted(var_dists.values())[num_clusts:] # The non-zero dists
        max_count = num_clusts
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
    def process_args_for_find_variants(self, vf, cluster_method, params, arg_list):
        # Check previous cycles used. Clustering should not be run if prev_cycles are None, or if prev_cycles didn't use all it was allocated even if allowed_cycles is higher now. Should be run if the previous run was killed early (how is that going to be recorded?).
        run_id, to_run_clustering = None, True

        max_cycles = arg_list[0] # Not checking this yet

        if cluster_method in vf.k_cluster_methods:
            if params in vf.cache['params']:
                run_id = vf.cache['params'][params]
                prev_method = vf.cache[run_id]['method']
                prev_args = vf.cache[run_id]['args']
                if cluster_method == 'brute force':
                    if prev_method == 'brute force':
                        to_run_clustering = False
                elif cluster_method == 'k medoids':
                    if prev_method == 'brute force':
                        to_run_clustering = False
                    elif prev_method == 'k medoids':
                        prev_rand_starts, rand_starts = prev_args[5], arg_list[4]
                        if prev_rand_starts >= rand_starts:
                            to_run_clustering = False
                elif cluster_method == 'k minibatch':
                    if prev_method == 'brute force' or prev_method == 'k medoids':
                        to_run_clustering = False
                    elif prev_method == 'k minibatch':
                        prev_rand_starts, prev_batch = prev_args[5:7]
                        rand_starts, batch_size = arg_list[4:6]
                        if prev_rand_starts >= rand_starts and prev_batch >= batch_size:
                            to_run_clustering = False
            # Can't use [..., *params] due to Python2 incompatibillity
            args = [run_id, cluster_method, max_cycles] + [p for p in params] + arg_list[4:]
            num_variants, tolerance = params
            run_description = '[{}] K@{:.2g}'.format(num_variants, tolerance)
            run_tooltip = '{} clusters at a tolerance of {}'.format(num_variants, tolerance)
        elif cluster_method in vf.threshold_cluster_methods:
            if params in vf.cache['params']:
                run_id = vf.cache['params'][params]
                prev_method = vf.cache[run_id]['method']
                prev_args = vf.cache[run_id]['args']
                if cluster_method == 'qt minimal':
                    if prev_method == 'qt minimal':
                        prev_max_cycles = prev_args[2]
                        if prev_max_cycles == None or max_cycles != None and prev_max_cycles >= max_cycles:
                            to_run_clustering = False
                elif cluster_method == 'qt greedy':
                    if prev_method == 'qt minimal':
                        to_run_clustering = False
            # Can't use [..., *params] due to Python2 incompatibillity
            args = [run_id, cluster_method, max_cycles] + [p for p in params] + arg_list[3:]
            threshold, percent = params
            run_description = '{:.3g}@{:.3g}%'.format(threshold, percent)
            run_tooltip = '{}% of variants within distance {} of a cluster centre'.format(percent, threshold)
        if to_run_clustering == True:
            run_id = vf.generate_run_id()
            args[0] = run_id
            vf.cache['params'][params] = run_id
            vf.cache[run_id] = {'status':'running', 'params':params, 'args':tuple(args), 'method':cluster_method, 'run_time':time.time(), 'cycles_used':0, 'quit_now':False}
        return run_id, tuple(args), run_description, run_tooltip, to_run_clustering

    # # #  Server maintainence  # # #
    def collect_garbage(self):
        self.connections.clean_dead()
        for s_id in list(self.sessions.keys()):
            if self.connections.is_dead(s_id):
                del self.sessions[s_id]
        if not self.web_server: # if personal server with no live instances.
            if self.connections.all_dead():
                print('Last Navargator instance closed, shutting down server.')
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
                    print('\nError encountered:\n{}'.format(line.strip()))
                self.error_log.append(line)


class ConnectionManager(object):
    """New instances that do exist but have not yet been maintained are identified by self.session_connections[s_id] = None. This should only happen when a new VariantFinder is instanciated."""
    def __init__(self, local_input_session_id, web_server, inactive_time, inactive_num, max_sessions):
        self.local_input_session_id = local_input_session_id
        self.web_server = web_server
        self.inactive_time = inactive_time
        self.inactive_num = inactive_num
        self.max_sessions = max_sessions
        self.session_connections = {}
        self.lock = threading.Lock()
        self.local_input_dead = web_server
        self.local_input_maintained = None # None means it hasn't been maintained yet, False means it's been closed or timed out. Otherwise is a time.

    def new_session(self, session_id, browser_id):
        if len(self.session_connections) >= self.max_sessions:
            raise NavargatorCapacityError()
        with self.lock:
            if session_id in self.session_connections:
                raise NavargatorRuntimeError('Error: something weird happened. A new session was added to the connection manager that already existed.')
            if self.local_input_dead != True:
                self.local_input_maintained = False
                self.local_input_dead = True
            self.session_connections[session_id] = {browser_id: time.time()}

    def maintain(self, session_id, browser_id):
        with self.lock:
            if session_id == self.local_input_session_id:
                self.local_input_maintained = time.time()
                self.local_input_dead = False
            elif session_id not in self.session_connections:
                self.session_connections[session_id] = {browser_id: time.time()}
            elif 'unknown' in self.session_connections[session_id]:
                del self.session_connections[session_id]['unknown']
                self.session_connections[session_id][browser_id] = time.time()
            else:
                self.session_connections[session_id][browser_id] = time.time()

    def close(self, session_id, browser_id):
        with self.lock:
            if session_id == self.local_input_session_id:
                self.local_input_maintained = False
                self.local_input_dead = True
            elif session_id in self.session_connections:
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
        """If there are fewer sessions than self.inactive_num, none are removed. If more, removes any browserIDs that haven't been maintained within self.inactive_time seconds, and then any sessionIDs that no longer have any live browserIDs."""
        if len(self.session_connections) <= self.inactive_num:
            return # Don't bother killing old sessions if under this number
        with self.lock:
            cur_time = time.time()
            sess_ages = []
            for s_id, connections in self.session_connections.items():
                for b_id, last_maintain in connections.items():
                    sess_ages.append((cur_time-last_maintain, s_id, b_id))
            for age, s_id, b_id in sorted(sess_ages, key=lambda sess: -sess[0]):
                if len(self.session_connections) <= self.inactive_num:
                    break
                if age > self.inactive_time:
                    del self.session_connections[s_id][b_id]
                if len(self.session_connections[s_id]) == 0:
                    del self.session_connections[s_id]
