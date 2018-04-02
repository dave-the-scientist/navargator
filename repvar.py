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

#vfinder.save_repvar_file('results/tbpb82.repvar')

vfinder = load_repvar_file('results/tbpb82')
vfinder.find_variants(8, method='k medoids')
exit()"""

if __name__ == '__main__':
    num_variants = 6
    method = 'k medoids'

    server_port = new_random_port()
    manual_browser = False
    #tree_data = open("/home/dave/Desktop/old_projects/porcine_diversity/ap_hp_tbpb_mcoffee.phylip_phyml_tree.txt").read()
    #available = []
    #ignored = ['L20[A.p]', 'Ap76[A.p]', 'ApJL03[A.p']

    daemon = repvar_daemon.RepvarDaemon(server_port)

    #idnum = daemon.new_variant_finder(tree_data, available, ignored)

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
