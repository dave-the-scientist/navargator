import sys, os, webbrowser, socket
from repvar_resources.variant_finder import load_repvar_file, VariantFinder
from repvar_resources import repvar_daemon

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
#vfinder = load_repvar_file('results/tbpb59_av-20')
vfinder = load_repvar_file('results/tbpb59_av-all')

tree_file = "/home/dave/Desktop/old_projects/porcine_diversity/ap_hp_tbpb_mcoffee.phylip_phyml_tree.txt"
vfinder = VariantFinder(tree_file)
vfinder.ignored = ['L20[A.p]', 'Ap76[A.p]', 'ApJL03[A.p']
vfinder.available = ['h87[A.p|sv', 'h49[A.p|sv', 'h57[A.suis', 'c15[H.p|nt']
#vfinder.available = vfinder.leaves[:20]
vfinder.save_repvar_file('results/tbpb59_av-4')

vfinder.find_variants(12, method='k medoids')
"""

if __name__ == '__main__':
    num_variants = 6
    method = 'k medoids'

    server_port = new_random_port()
    manual_browser = False
    #tree_data = open("/home/dave/Desktop/old_projects/porcine_diversity/ap_hp_tbpb_mcoffee.phylip_phyml_tree.txt").read()
    available = []
    ignored = ['L20[A.p]', 'Ap76[A.p]', 'ApJL03[A.p']

    daemon = repvar_daemon.RepvarDaemon(server_port)

    #idnum = daemon.new_instance(tree_data, available, ignored)
    #daemon.process_instance(idnum, num_variants, method=method)
    # These 2 will not be called here, but by the input page once the user presses 'Run'.
    # By default, this should open to the input page.
    # If the user specifies a repvar file, that data should be loaded into the input page.
    #   Add method to add existing vfinder to daemon, return idnum. Then on input page, if it's opened with an idnum, it requests data from daemon to display. Otherwise it loads blank.

    load_existing = False
    if load_existing:
        input_url = 'http://127.0.0.1:%i/input?%s' % (server_port, idnum)
    else:
        input_url = 'http://127.0.0.1:%i/input?%s' % (server_port, daemon.local_input_id)
    old_stderr = os.dup(2)
    os.close(2)
    os.open(os.devnull, os.O_RDWR)
    try:
        webbrowser.open(input_url)
    finally:
        os.dup2(old_stderr, 2)

    daemon.start_server()
