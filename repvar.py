import sys, os
from repvar_resources.variant_finder import load_repvar_file, VariantFinder
from repvar_resources import repvar_daemon
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

    server_port = 62888
    manual_browser = False
    tree_data = open("/home/dave/Desktop/old_projects/porcine_diversity/ap_hp_tbpb_mcoffee.phylip_phyml_tree.txt").read()
    available = []
    ignored = ['L20[A.p]', 'Ap76[A.p]', 'ApJL03[A.p']

    daemon = repvar_daemon.RepvarDaemon(server_port)

    idnum = daemon.new_instance(tree_data, available, ignored)
    daemon.process_instance(idnum, num_variants, method=method)
    # These 2 will not be called here, but by the input page once the user presses 'Run'.
    #By default, this should open to the input page. If the user specifies a repvar file, that data should be loaded into the input page.

    daemon.start_server()
