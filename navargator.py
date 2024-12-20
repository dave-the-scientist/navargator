import sys, os, webbrowser, socket
from navargator_resources.variant_finder import load_navargator_file
from navargator_resources import navargator_daemon

__author__ = 'David Curran'
__version__ = '0.7.0'

def new_random_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 0))
    ip, prt = sock.getsockname()
    if result == 0:
        print('\nError trying to open a random port. Returned code: {}, ip: {}, port: {}'.format(result, ip, prt))
        return False
    else:
        return prt


# BIG TODO: move all general todo statements from all other files here. stop the duplication. leave file-specific todo lists only for smaller things specific to that file.

# TODO:
# - Move some of the running options for clustering to a pop-out "Advanced options" window.
#   - Clustering tolerance, random starts, batch size (probably make that scale; maybe sqrt(num) * 12)
# - When I design the GUI-free version, ensure it makes good use of threading (brute force can split up the list of combinations; medoids+minibatch can split replicates; threshold might split up computation of cluster size?). Threadpool should work.
#   - Can even use the same command line option for threads. If using GUI it's the number of whole runs that can be processed at once; if not using GUI it's the number of threads a single run makes use of.
# - Actually put this together with the option menus.
#   - When done, edit the IE warning message at the top of input.html to include the correct command line flag.
# - Ensure that a message is printed indicating the server may occasionally hang, but ctrl-c can be used to stop the program at any time.
# - Should remove mentions of "variants", replace with "medoids" or "clusters".



# Feature requests:
# - Sort of like selection groups, add the ability to indicate specific sequences on the tree. Use the existing beams (in place for searching / chosen), add the sequence name floating horizontally at the end. Would be good to have all of these in a svg group on the top of the tree, to allow for easy editing of the labels & their positioning (something i probably don't want to deal with).
# - Consider adding parsers for JPLACE (https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0031009) to the phylo package
# - The ability to draw radial (unrooted) trees. May play well with my existing drawing functions.
#   - Look into the "equal angle" algorithm for drawing them (introduced in https://pubmed.ncbi.nlm.nih.gov/10547839/) and the "equal daylight" algorithm which is an improvement (introduced in https://currentprotocols.onlinelibrary.wiley.com/doi/10.1002/0471250953.bi0604s00)
# - The ability to use rectangular trees. 
# - Improved drawing of cluster blobs. Especially those that include leaves from all over; I'd like them to try and avoid each other, maybe go concave to wrap around the root, etc.

# BUG reports:
# - Load one nvgtr file, then load a different one (pm_slam, then pm_slp_mature_annotated). Error. Maybe they both need to have banners, maybe need different number of banners.
#   - Uncaught TypeError: Cannot set properties of undefined (setting 'node_rest_colour') at changeSelectionGroupNodeColour


# NOTE:
# - After re-rooting the tree (via midpoint, but probably outgroup as well) and saving a nvrgtr session, the saved distance matrix will be slightly different from a newly-calculated distance matrix. It's down to floating point errors, and the difference is ~1E-6 or 1E-16 in either direction.


if __name__ == '__main__':
    server_port = new_random_port()
    manually_open_browser = False
    mute_opening_browser_warnings = True
    num_threads = 3
    verbose = False
    tree_format = 'auto'

    daemon = navargator_daemon.NavargatorDaemon(server_port, threads=num_threads, verbose=verbose)

    if len(sys.argv) == 1:
        input_url = 'http://127.0.0.1:{}/input?{}'.format(server_port, daemon.local_input_session_id)
    else:
        input_file = sys.argv[1].strip()
        file_name = os.path.basename(input_file)

        if input_file.lower().endswith('.nvrgtr'):
            vfinder = load_navargator_file(input_file, verbose=verbose)
            session_id = daemon.add_variant_finder(vfinder)
        else:
            tree_data = open(input_file).read().strip()
            session_id = daemon.new_variant_finder(tree_data, tree_format, file_name=file_name)
        input_url = 'http://127.0.0.1:{}/input?{}'.format(server_port, session_id)

    if manually_open_browser:
        print('Open a browser to the following URL:\n{}'.format(input_url))
    else:
        #print('Opening browser...')
        if mute_opening_browser_warnings:
            old_stderr = os.dup(2)
            os.close(2)
            os.open(os.devnull, os.O_RDWR)
            try:
                webbrowser.open(input_url)
            finally:
                os.dup2(old_stderr, 2)
        else:
            webbrowser.open(input_url)
    daemon.start_server()
