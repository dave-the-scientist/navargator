import sys, os, webbrowser, socket
from navargator_resources.variant_finder import load_navargator_file
from navargator_resources import navargator_daemon

__author__ = 'David Curran'
__version__ = '0.1.1'

def new_random_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 0))
    ip, prt = sock.getsockname()
    if result == 0:
        print('\nError trying to open a random port. Returned code: %i, ip: %s, port: %i' % (result, ip, prt))
        return False
    else:
        return prt


# TODO:
# - Actually put this together with the option menus.
#   - When done, edit the IE warning message at the top of input.html to include the correct command line flag.
# - Ensure that a message is printed indicating the server may hang, but ctrl-c can be used to stop the program at any time.

# BUG reports:

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
        input_url = 'http://127.0.0.1:%i/input?%s' % (server_port, daemon.local_input_session_id)
    else:
        input_file = sys.argv[1].strip()
        file_name = os.path.basename(input_file)

        if input_file.lower().endswith('.nvrgtr'):
            vfinder = load_navargator_file(input_file, verbose=verbose)
            session_id = daemon.add_variant_finder(vfinder)
        else:
            tree_data = open(input_file).read().strip()
            session_id = daemon.new_variant_finder(tree_data, tree_format, file_name=file_name)
        input_url = 'http://127.0.0.1:%i/input?%s' % (server_port, session_id)

    if manually_open_browser:
        print('Open a browser to the following URL:\n%s' % input_url)
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
