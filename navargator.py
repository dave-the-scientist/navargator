import sys, os, webbrowser, socket
from navargator_resources.variant_finder import load_navargator_file, VariantFinder
from navargator_resources import navargator_daemon

__author__ = 'David Curran'
__version__ = '0.1.1' # test

def new_random_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 0))
    ip, prt = sock.getsockname()
    if result == 0:
        print('\nError trying to open a random port. Returned code: %i, ip: %s, port: %i' % (result, ip, prt))
        return False
    else:
        return prt


"""
tree_file = "results/Bootstrap100_rooted.nwk"
vfinder = VariantFinder(tree_file)
avail = []
for l in vfinder.leaves:
    if l == 'Hps.hrn11.Unk': continue
    if l.split('.')[-2][0] == 'h':
        avail.append(l)
vfinder.available = avail
vfinder.ignored = ['App.L20.SV5', 'App.JL03.SV3', 'App.76.Unk']
vfinder.chosen = ['Hps.Strain5.Unk']

#vfinder.ignored = ['L20[A.p]', 'Ap76[A.p]', 'ApJL03[A.p']
#vfinder.available = ['h87[A.p|sv', 'h49[A.p|sv', 'h57[A.suis', 'c15[H.p|nt']
#vfinder.available = vfinder.leaves[:20]

#vfinder.save_navargator_file('results/tbpb82.nvrgtr')

vfinder = load_navargator_file('results/tbpb82')
vfinder.find_variants(8, method='k medoids')
exit()"""
# TODO:
# -- Need to calculate defaults like show/hide variant names (if too many or too long).
# -- Provide controls for display options (font sizes, colours, etc). I think I want this in a collapsable style-box
# -- Change nvrgtr file format. A sequence name could start with '[', which would mess it up. However, '[(' cannot happen in a newick tree, so that's how I should format my tag lines. A seq name could start with '#', so I think '//' is probably a better way to format comment lines.

# BUG reports:


if __name__ == '__main__':
    server_port = new_random_port()
    manually_open_browser = False
    mute_opening_browser_warnings = True
    num_threads = 3
    verbose = False

    daemon = navargator_daemon.NavargatorDaemon(server_port, threads=num_threads, verbose=verbose)

    if len(sys.argv) == 1:
        input_url = 'http://127.0.0.1:%i/input?%s' % (server_port, daemon.local_input_session_id)
    else:
        input_file = sys.argv[1].strip()
        if input_file.lower().endswith('.nvrgtr'):
            vfinder = load_navargator_file(input_file, verbose=verbose)
            idnum = daemon.add_variant_finder(vfinder)
        else:
            idnum = daemon.new_variant_finder(input_file)
        input_url = 'http://127.0.0.1:%i/input?%s' % (server_port, idnum)

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