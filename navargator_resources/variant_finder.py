"""
Defines the following public functions:
  load_navargator_file(file_path)
"""
import os, sys, itertools, random, time, base64
from math import log, exp, ceil
from io import BytesIO
from copy import deepcopy
from collections import Counter
import numpy as np
from navargator_resources import phylo
from navargator_resources.navargator_common import NavargatorValidationError, NavargatorValueError
#from navargator_resources.navargator_common import NavargatorRuntimeError

phylo.verbose = False

# TODO:

# Implement LAB in _heuristic_rand_starts()
# In find_variants() calculate unassigned_orphans from nbrs. Get rid of reduced. Change _qt_radius_clustering_minimal so it uses nbrs instead of reduced. Make sure it's using claimed_inds from the greedy; this is the large speedup from the k-medoids authors. Might be a good idea to run the greedy algo first (without refinement) to get an initial upper bound on the solution size (check if this is faster / better than the average time needed to get the first solution in the current implementation; I bet it's way faster).

# - Change all instances calling something a "center"/"centre" into a "medoid". It's a more correct term, and what I use in the paper.
# - Get the qt methods using _score_pattern() instead of the 2-step process. This should probably use claimed_inds? Or not?
# - Finish / clean up _qt_radius_clustering().
# - _brute_force_clustering() throws an awkward error if quit before finding a valid solution. Make this more graceful.

# - Move _test_dominated_inds(). Working well, but put it in the cluster_subset fxn. it should also integrate with single_pass_optimize somehow

# - In the K- cluster methods (and at least the final_optimize step in qt_minimal) I have a set of inds and try swapping out one at a time with a set of avails to see if there is any improvement. I'm pretty sure that whole bit should be vectorizable; it's possible I have to set self dists to inf or something.
#   - The original author of k-medoids recently published a pretty substantial improvement to the algorithm (https://www.sciencedirect.com/science/article/pii/S0306437921000557#b4) I need to incorporate these.

# - I'd like a hierarchical k-clustering method that generates k monophyletic groups. 
#   - Should be easy and blazingly fast; start at root with 2 clusters, test effect of splitting each cluster, pick the one that results in lowest tree score, repeat until reaching the user's k. 
#     - Is this guaranteed optimal? How do I handle it when one sibling is a terminal node and the other is a large subtree? If I have to find a centroid on each check, maybe it won't be so fast. Possibly I can use something like the variance / average distance in a subgroup instead of finding a single centroid (well, given a set of inds, finding the centroid is just summing the distance matrix along 1 dimension and then identifying the min, probably will be fast).
#     - The range of k in real world work is going to be pretty small. There are not going to be very many possible ways to partition a tree into that many clusters, at least, not many that are even remotely feasible (probably easy to identify many prohibited branches in the decision tree). A brute-force evaluation might be pretty reasonable, and would then certainly be guaranteed optimal.
#   - k-medoids is basically agnostic to the root, and even the branching pattern; it only operates on the distances. Besides speed, this method would respect the choice of root and cannot violate the branching pattern (would also prevent one cluster nested in another).
#   - Also include a critical % (so 90% of nodes are contained in k=4 clusters)? Maybe would help deal with "orphan" singletons, maybe would mean the analysis cannot rely on purely local information and would require dynamic programming (would definitely mean this greedy approach is non-optimal).
#     - Another approach would be for the user to select k as the number of non-singleton clusters. Then don't think I need DP.
#   - If this method is super fast, use it as one of the initializations when running k-medoids

# - Save the vf.cache to the nvrgtr file, load all options, show graph, etc on load.
#   - Not until I've implemented the enhanced summary stats info; need to know what's useful to save.

# TODO alternate clustering
# - Right now k- based clustering gets biased if there are many sequences that are identical or extremely close together. Centers are attracted to these groups, though they are not really giving a representative variant for the whole tree.
# - Instead of working with the distance from each similar sequence to a center, maybe something with the cumulative branch lengths? Does the Clustering Tolerance touch this? Hierarchical? Some method of weighting leaves based on how similar they are to their nearest (phylo distance) node(s)?

# TODO EM clustering
# - Probably hold off until V2; can't use tree score as the sum of all points to their center. Because a point does not necessarily belong to the closest cluster center, but rather the cluster with the highest probability (based on stddev of each cluster). Could sum stddev * cluster size?
# - Need to implement a form of EM medoids clustering, so not standard EM.
# - In essence, start with random cluster centers, assign nodes to closest, calculate stddevs. Then E-step: compute responsibilities (probability of belonging to best/sum) for each point. Then M-step: use responsibilities as weights, re-calculate medoids (closest sum dist to all in cluster) & stddevs.
# - This gives some details, but need to adapt: https://towardsdatascience.com/expectation-maximization-explained-c82f5ed438e5


# NOTE:
# - I originally had allowed comments in nvrgtr files, but large encoded distance matrices spawned too many random characters that duplicated it.
# - Calculating the distance matrix for a tree of 4173 leaves took around 67 seconds, while loading it's nvrgtr file took 4. The file was 94MB though.
#   - I feel like I must be able to vectorize / parallelize that calculation. Right now, I think I'm re-calculating the distances between various internal nodes a ton of times. I think I can more efficiently build the distance matrix while parsing the tree file the first time. Keep track of distance from each terminal node read so far to internal nodes, when encountering new terminal nodes finalize their distances as I go.
#   - Should work. I've sketched out a plan in the Steno book in my drawer

# - Check out the methods in Treeswift (https://github.com/niemasd/TreeSwift), they may have solved some of the optimized algorithms I'm thinking about. Not sure if their distance_matrix calculation is as efficient as what I'm looking for, but it's most likely better than my current implementation.


# # # # #  Session file strings  # # # # #
# Note: tags are expected to be in sentence case
tag_affixes = ('[(', ')]')
chosen_nodes_tag = 'Chosen variants'
available_nodes_tag = 'Available variants'
ignore_nodes_tag = 'Ignored variants'
display_options_tag = 'Display options - ' # The option category string is appended to this.
selection_group_tag = 'Selection group - ' # The selection group name is appended to this.
tree_data_tag = 'Newick tree'
dist_matrix_tag = 'Distance matrix'
sg_order_key = '__sg_order__'  # The order of the selection groups; key is for internal representation.

# # # # #  Misc functions  # # # # #
def load_navargator_file(file_path, verbose=True):
    if not os.path.isfile(file_path) and not file_path.lower().endswith('.nvrgtr'):
        file_path += '.nvrgtr'
    if not os.path.isfile(file_path):
        raise NavargatorValueError('Error: could not find the given navargator file "{}"'.format(file_path))
    if verbose:
        print('Loading information from %s...' % file_path)
    file_name = os.path.basename(file_path)
    with open(file_path, 'r') as f:
        vfinder = navargator_from_data(f, file_name=file_name, verbose=verbose)
    return vfinder
def navargator_from_data(data_lines, file_name='unknown file', verbose=False):
    """Expects data as an iterable of lines. Should be either a file object or a str.splitlines()."""
    data = {}
    # #  Start of process_tag_data()
    def process_tag_data(tag, data_buff):
        if tag in data:
            raise NavargatorValidationError('Error: the given NaVARgator session file has multiple sections labeled "{}{}{}".'.format(tag_affixes[0], tag, tag_affixes[1]))
        if not data_buff:
            return
        if tag in (chosen_nodes_tag, available_nodes_tag, ignore_nodes_tag): # These data to be split into lists
            val = ','.join(data_buff).replace(',,', ',')
            val_list = val.split(',')
            data[tag] = val_list
        elif tag.startswith(display_options_tag):
            category = tag[len(display_options_tag) : ].strip()
            cat_dict = data.setdefault(display_options_tag, {}).setdefault(category, {})
            for opt_line in data_buff:
                opt, _, val = opt_line.partition(':')
                if opt in ('banner_names',): # To be split into lists
                    cat_dict[opt.strip()] = val.strip().split(', ')
                else:
                    cat_dict[opt.strip()] = val.strip()
        elif tag.startswith(selection_group_tag):
            sg_name = tag[len(selection_group_tag) : ].strip()
            data.setdefault(sg_order_key, []).append(sg_name)
            sg_dict = data.setdefault(selection_group_tag, {}).setdefault(sg_name, {})
            for opt_line in data_buff:
                opt, _, val = opt_line.partition(':')
                val = val.strip()
                if opt in ('banner_colours', 'names'): # To be split into lists
                    sg_dict[opt.strip()] = [v if v != 'None' else None for v in val.split(', ')]
                else:
                    sg_dict[opt.strip()] = val if val != 'None' else None
        elif tag == tree_data_tag: # These data are stored as a single string
            data[tag] = data_buff[0]
        elif tag == dist_matrix_tag:
            data[tag] = '\n'.join(data_buff) + '\n'
        else:
            data[tag] = data_buff
    # #  End of process_tag_data()
    tag, data_buff = '', []
    for line in data_lines:
        line = line.strip()
        if not line: continue
        if line.startswith(tag_affixes[0]) and line.endswith(tag_affixes[1]):
            process_tag_data(tag, data_buff)
            tag, data_buff = line[len(tag_affixes[0]):-len(tag_affixes[1])], []
        else:
            data_buff.append(line)
    process_tag_data(tag, data_buff)
    # data dict is now filled out
    try:
        tree_data = data[tree_data_tag]
    except KeyError:
        raise NavargatorValidationError('Error: could not identify the tree data in the given NaVARgator session file.')
    # Check if some optional information is present:
    display_options = data.get(display_options_tag, {})
    selection_groups_order = data.get(sg_order_key, [])
    selection_groups_data = data.get(selection_group_tag, {})
    encoded_distance_matrix = data.get(dist_matrix_tag)
    if encoded_distance_matrix:
        try:
            distance_matrix = decode_distance_matrix(encoded_distance_matrix)
        except Exception as err:
            print('Warning: could not load the distance matrix from the .nvrgtr file as it appears to be corrupted; it will be calculated de novo. The generated error: {}'.format(err))
            distance_matrix = None
    else:
        distance_matrix = None
    # Create the VF object:
    vfinder = VariantFinder(tree_data, tree_format='newick', file_name=file_name, display_options=display_options, selection_groups_order=selection_groups_order, selection_groups_data=selection_groups_data, distance_matrix=distance_matrix, verbose=verbose)
    # Fill out the assigned variants if present:
    chsn, avail, ignor = data.get(chosen_nodes_tag), data.get(available_nodes_tag), data.get(ignore_nodes_tag)
    if chsn:
        vfinder.chosen = chsn
    if avail:
        vfinder.available = avail
    if ignor:
        vfinder.ignored = ignor
    return vfinder
def decode_distance_matrix(encoded):
    """Takes an ascii string representing a flattened numpy array, decodes it, then rebuilds and returns the full distance matrix."""
    bin_data = base64.decodestring(encoded.encode()) # From ascii string to decoded Bytes object
    flat = np.load(BytesIO(bin_data), allow_pickle=False) # Load the flattened numpy array
    return unflatten_distance_matrix(flat)
def unflatten_distance_matrix(flat):
    """Takes a flattened array of the upper trianglular values of a distance matrix, and rebuilds the full symmetrical distance matrix."""
    # (size * (size+1)) / 2 = len(flat)
    size = int(round(max(np.roots([1, 1, -2*len(flat)])))) # Solves the quadratic equation. The 'round' is very needed to deal with floating point errors.
    inds = np.triu_indices(size)
    dist = np.zeros((size, size))
    dist[inds] = flat
    return dist + np.tril(dist.T, -1)
def flatten_distance_matrix(dist):
    """As dist is symmetrical, this keeps only the upper triangluar values in order to save space."""
    inds = np.triu_indices(dist.shape[0])
    return dist[inds]
def binomial_coefficient(n, k):
    """Quickly computes the binomial coefficient of n-choose-k. This may not be exact due to floating point errors and the log conversions, but is close enough for my purposes."""
    try:
        xrange
    except NameError:
        xrange = range
    def log_factorial(num):
        _sum = 0
        for i in xrange(2, num+1):
            _sum += log(i)
        return _sum
    return int(round(exp(log_factorial(n) - log_factorial(k) - log_factorial(n-k)), 0))
def format_integer(num, max_num_chars=15, sci_notation=False):
    """Formats the number into a string using commas if it is large. If the string would be longer than max_num_chars, or if sci_notation=True, scientific notation is used instead."""
    abs_num = abs(num)
    orig_str = str(abs_num)
    orig_len = len(orig_str)
    num_commas = (orig_len-1) // 3 if abs_num >= 1000 else 0
    neg_sign_len = 1 if num < 0 else 0
    final_len = orig_len + num_commas + neg_sign_len
    if sci_notation or final_len > max_num_chars:
        num_str = '%.1e' % abs_num
    elif 0 <= abs_num < 1000:
        num_str = orig_str
    else:
        first_chars = ((orig_len - 1) % 3) + 1
        char_list = [orig_str[:first_chars]] + [orig_str[i:i+3] for i in range(first_chars, orig_len, 3)]
        num_str = ','.join(char_list)
    if num < 0:
        num_str = '-' + num_str
    return num_str


class VariantFinder(object):
    def __init__(self, tree_input, tree_format='auto', file_name='unknown file', display_options=None, selection_groups_order=None, selection_groups_data=None, distance_matrix=None, verbose=True, _blank_init=False):
        self.file_name = file_name
        self.verbose = bool(verbose)
        self.leaves = []
        self.ordered_names = []
        self.tree_size = 0
        self._clear_cache(reset_normalize=False) # self.cache = {}
        self.normalize = self._empty_normalize()
        self.k_cluster_methods = set(['k minibatch', 'k medoids', 'brute force'])
        self.threshold_cluster_methods = set(['qt minimal', 'qt greedy'])
        if display_options:
            self.display_options = display_options
        else:
            self.display_options = {}
        if selection_groups_order and selection_groups_data:
            self.selection_groups_order = selection_groups_order
            self.selection_groups_data = selection_groups_data
        else:
            self.selection_groups_order = []
            self.selection_groups_data = {}
        # Load tree data
        if not _blank_init:
            tree_format = tree_format.lower().strip()
            if tree_format == 'auto':
                self.tree = phylo.load_tree_string(tree_input)
            elif tree_format == 'newick':
                self.tree = phylo.load_newick_string(tree_input)
            elif tree_format == 'nexus':
                self.tree = phylo.load_nexus_string(tree_input)
            elif tree_format == 'phyloxml':
                self.tree = phylo.load_phyloxml_string(tree_input)
            elif tree_format == 'nexml':
                self.tree = phylo.load_nexml_string(tree_input)
            else:
                raise NavargatorValueError("Error: the tree format '{}' was not recognized.".format(tree_format))
            if self.tree == None:
                raise NavargatorValidationError("Error: the tree data could not be parsed.".format(tree_format))
            self.tree.balance_negative_branches()
            self.tree.clear_negative_branches()
            if distance_matrix is not None:
                self.leaves = self.tree.get_named_leaves()
                self.tree_size = len(self.leaves)
                if type(distance_matrix) != type(np.zeros(1)):
                    raise NavargatorValueError("Error: cannot initiate VariantFinder with the given 'distance_matrix' as it is the incorrect object type")
                elif distance_matrix.shape != (self.tree_size, self.tree_size):
                    raise NavargatorValueError("Error: cannot initiate VariantFinder with the given 'distance_matrix' as its shape '{}' is incompatible with the  given tree of length {}".format(distance_matrix.shape, self.tree_size))
                self.orig_dists = distance_matrix
            else:
                self.leaves, self.orig_dists = self.tree.get_distance_matrix()
                self.tree_size = len(self.leaves)
            self.index = {name:index for index, name in enumerate(self.leaves)}
            max_name_length = self.display_options.setdefault('sizes', {}).get('max_variant_name_length', None)
            if max_name_length == None:
                max_name_length = max(len(name) for name in self.leaves)
                self.display_options['sizes']['max_variant_name_length'] = max_name_length
            self.update_tree_data()
            self.max_root_distance = self._calc_max_root_dist()
        self._ignored = set() # Accessible as self.ignored
        self._available = set() # Accessible as self.available
        self._chosen = set() # Accessible as self.chosen
        # # #  Private attributes # # #
        self._not_ignored_inds = set(range(self.tree_size))
        self._max_brute_force_attempts = 1000000 # Under 1 minute for 1 million.
        self._private_display_opts = set(['cluster_background_trans', 'cluster_highlight_trans'])

    # # # # #  Public methods  # # # # #
    def find_variants(self, run_id, method, max_cycles, *args):
        if method in self.k_cluster_methods:
            num_variants, tolerance = args[:2]
            num_avail, num_chsn = len(self.available), len(self.chosen)
            if not num_chsn <= num_variants <= num_avail + num_chsn:
                raise NavargatorValueError('Error finding variants: num_variants must be an integer greater than or equal to the number of chosen nodes ({}) but less than or equal to the number of available + chosen nodes ({}).'.format(num_chsn, num_avail + num_chsn))
            params = (num_variants, tolerance)
            if num_variants == num_chsn or num_variants == num_avail + num_chsn:  # Trivial clustering
                if num_variants == num_chsn:
                    variants = [self.index[name] for name in list(self.chosen)]
                else:
                    variants = [self.index[name] for name in list(self.available)+list(self.chosen)]
                dists = self._transform_distances(tolerance)
                clusters = self._partition_nearest(variants, dists)
                scores = self._sum_dist_scores(variants, clusters, dists)
                alt_variants = []
            elif method == 'brute force':
                if self.verbose:
                    num_possible_combinations = binomial_coefficient(num_avail, num_variants-num_chsn)
                    expected_runtime = int(round(num_possible_combinations * 0.000042, 0))
                    print('Finding optimal variants using brute force. This should take ~{} seconds...'.format(expected_runtime))
                variants, scores, alt_variants = self._brute_force_clustering(num_variants, tolerance, self.cache[run_id], max_cycles)
            elif method == 'k medoids':
                num_replicates = args[2]
                if self.verbose:
                    print('Choosing variants using k medoids...')
                fxn, fxn_args = self._cluster_k_medoids, (num_variants, tolerance, self.cache[run_id])
                variants, scores, alt_variants = self._heuristic_rand_starts(fxn, fxn_args, num_replicates, self.cache[run_id], max_cycles)
            elif method == 'k minibatch':
                num_replicates, batch_size = args[2:]
                if self.verbose:
                    print('Choosing variants using k minibatch...')
                fxn, fxn_args = self._cluster_k_medoids_minibatch, (num_variants, tolerance, batch_size, self.cache[run_id])
                variants, scores, alt_variants = self._heuristic_rand_starts(fxn, fxn_args, num_replicates, self.cache[run_id], max_cycles)
            if self.verbose:
                self._print_clustering_results(num_variants, variants, scores, alt_variants)
        elif method in self.threshold_cluster_methods:
            threshold, thresh_percent = args[:2]
            params = (threshold, thresh_percent)

            reduced, unassigned_orphans = self._reduce_distances(threshold)

            min_to_cluster = ceil(thresh_percent/100.0 * len(self._not_ignored_inds))
            num_allowed_orphans = len(self._not_ignored_inds) - min_to_cluster
            if len(unassigned_orphans) > num_allowed_orphans:
                # Too many unassigned further than threshold distance from the closest available
                percent_feasible = (len(self._not_ignored_inds)-len(unassigned_orphans)) / float(len(self._not_ignored_inds)) * 100.0
                error_msg = 'Error: infeasible parameters (only {:.2f}% could be clustered within the given threhsold). To fix this, raise the critical threshold, lower the critical percent, or add more available variants.'.format(percent_feasible)
                variants, scores, alt_variants = [], error_msg, []
            elif method == 'qt minimal':
                variants, scores, alt_variants = self._qt_radius_clustering_minimal(min_to_cluster, reduced, unassigned_orphans, self.cache[run_id], max_cycles)
            elif method == 'qt greedy':
                variants, scores, alt_variants = self._qt_radius_clustering_greedy(min_to_cluster, threshold, self.cache[run_id], max_cycles)
        else:
            raise NavargatorValueError('Error: clustering method "{}" is not recognized'.format(method))
        self._calculate_cache_values(run_id, params, variants, scores, alt_variants)
        return variants, scores, alt_variants

    def root_midpoint(self):
        self.tree.root_midpoint()
        self.update_tree_data()
        if self.verbose:
            print('\nRe-rooted the tree to its midpoint')

    def root_outgroup(self, outgroup_names):
        # self.tree needs the original leaf names to re-root them
        full_leaves = set(self.tree.get_named_leaves())
        full_outgroup = []
        for name in outgroup_names:
            if name in full_leaves:
                full_outgroup.append(name)
            else:
                for leaf in full_leaves:
                    if leaf.startswith(name):
                        # this works as names are guaranteed to be unique at the current truncation
                        full_outgroup.append(leaf)
                        break
        self.tree.root_outgroup(full_outgroup, distance=0.5, distance_proportion=True)
        self.update_tree_data()
        if self.verbose:
            print('\nRe-rooted the tree to the given outgroup')

    def reorder_tree_nodes(self, increasing):
        self.tree.reorder_children(increasing=increasing)
        self.update_tree_data()
        if self.verbose:
            print('\nRe-ordered the tree nodes')

    def truncate_names(self, truncation):
        """Truncates the names of the leaf nodes. This is a VariantFinder-specific change, as the self.tree object will always contain the full node names."""
        self.update_tree_data(truncation=truncation)
        # Update leaf names in relevant variables:
        new_leaves = [name[:truncation] for name in self.tree.get_named_leaves()]
        trans = dict((old_name, new_name) for old_name,new_name in zip(self.leaves, new_leaves))
        self.index = {name:index for index, name in enumerate(new_leaves)}
        self._available = set(trans[name] for name in self.available)
        self._chosen = set(trans[name] for name in self.chosen)
        self._ignored = set(trans[name] for name in self.ignored)
        self.leaves = new_leaves
        for sg_data in self.selection_groups_data.values():
            sg_data['names'] = [trans[name] for name in sg_data['names']]
        # Don't have to modify self._not_ignored_inds as the order of self.leaves hasn't changed.
        # Re-generate the cache; names have changed, but cluster patterns and scores haven't:
        old_cache = self.cache
        self._clear_cache(reset_normalize=False)
        for params, run_id in old_cache['params'].items():
            info = old_cache[run_id]
            variant_inds = np.array([self.leaves.index(trans[name]) for name in info['variants']])
            scores = info['scores'][::]
            alt_variants = [alt.copy() for alt in info['alt_variants']]
            self._calculate_cache_values(run_id, params, variant_inds, scores, alt_variants)
        self.display_options['sizes']['max_variant_name_length'] = truncation
        if self.verbose:
            print('\nTruncated the tree names')

    def update_tree_data(self, truncation=None):
        """Ensures both trees can be formatted before updating the attributes. Also resets self.ordered_names."""
        if truncation == None:
            truncation = int(self.display_options['sizes']['max_variant_name_length'])
        newick_tree_data = self.tree.newick_string(support_as_comment=False, support_values=False, comments=False, internal_names=False, max_name_length=truncation)
        phyloxml_tree_data = self.tree.phyloxml_string(support_values=False, comments=False, internal_names=False, max_name_length=truncation)
        self.newick_tree_data = newick_tree_data
        self.phyloxml_tree_data = phyloxml_tree_data
        self.ordered_names = self.tree.get_ordered_names()

    def get_tree_string(self, tree, tree_type):
        truncation = int(self.display_options['sizes']['max_variant_name_length'])
        if tree_type == 'newick':
            return tree.newick_string(support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=truncation)
        elif tree_type == 'nexus':
            return tree.nexus_string(translate_command=False, support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=truncation)
        elif tree_type == 'phyloxml':
            return tree.phyloxml_string(support_values=True, comments=True, internal_names=True, max_name_length=truncation)
        elif tree_type == 'nexml':
            return tree.nexml_string(support_values=True, comments=True, internal_names=True, max_name_length=truncation)
        else:
            raise NavargatorValueError('Error: tree format "{}" is not recognized'.format(tree_type))
            return ''

    def save_tree_file(self, file_path, tree_str):
        with open(file_path, 'w') as f:
            f.write(tree_str)
        if self.verbose:
            print('\nTree saved to %s' % file_path)

    def save_navargator_file(self, file_path, include_distances=True):
        if not file_path.lower().endswith('.nvrgtr'):
            file_path += '.nvrgtr'
        nvrgtr_str = self.get_navargator_string(include_distances=include_distances)
        with open(file_path, 'w') as f:
            f.write(nvrgtr_str)
        if self.verbose:
            print('\nData saved to %s' % file_path)

    def get_navargator_string(self, include_distances=True):
        tag_format_str = '{}{{:s}}{}\n{{:s}}'.format(*tag_affixes)
        buff = []
        if self.ignored:
            ignor_names = ', '.join(sorted(self.ignored))
            buff.append(tag_format_str.format(ignore_nodes_tag, ignor_names))
        if self.chosen:
            chsn_names = ', '.join(sorted(self.chosen))
            buff.append(tag_format_str.format(chosen_nodes_tag, chsn_names))
        if self.available:
            avail_names = ', '.join(sorted(self.available))
            buff.append(tag_format_str.format(available_nodes_tag, avail_names))
        # Write display options
        if self.display_options:
            for category in ('colours', 'sizes', 'angles', 'show', 'labels', 'fonts'):
                if category not in self.display_options:
                    continue
                cat_buff = []
                for key in sorted(self.display_options[category].keys()):
                    if key in self._private_display_opts:
                        continue
                    elif key in ('banner_names',):  # For lists of strings
                        value = ', '.join(label.replace(',','.') for label in self.display_options[category][key])
                        if len(value) == 0:
                            continue
                    else:
                        value = str(self.display_options[category][key])
                    cat_buff.append('{:s}: {:s}'.format(key, value))
                if cat_buff:
                    cat_tag = display_options_tag + category
                    cat_opts = '\n'.join(cat_buff)
                    buff.append(tag_format_str.format(cat_tag, cat_opts))
        # Write selection groups in order
        for sg_name in self.selection_groups_order:
            sg_buff = []
            for key in sorted(self.selection_groups_data[sg_name].keys()):
                if key in ('names', 'banner_colours'):
                    value = ', '.join(str(val).replace(',','.') for val in self.selection_groups_data[sg_name][key])
                else:
                    value = str(self.selection_groups_data[sg_name][key])
                sg_buff.append('{:s}: {:s}'.format(key, value))
            if sg_buff:
                sg_tag = selection_group_tag + sg_name
                sg_opts = '\n'.join(sg_buff)
                buff.append(tag_format_str.format(sg_tag, sg_opts))
        # Write tree data
        buff.append(tag_format_str.format(tree_data_tag, self.newick_tree_data))
        # Write distance matrix if requested
        if include_distances:
            buff.append(tag_format_str.format(dist_matrix_tag, self.encode_distance_matrix()))
        return '\n\n'.join(buff)

    def generate_run_id(self):
        """Generates a unqiue string to represent one set of clustering parameters from any method."""
        r_id_len = 4
        r_id = 'r'+''.join([str(random.randint(0,9)) for i in range(r_id_len)])
        while r_id in self.cache:
            r_id = 'r'+''.join([str(random.randint(0,9)) for i in range(r_id_len)])
        return r_id

    def get_distance(self, name1, name2):
        """Returns the phylogenetic distance between the two given sequence names. Uses the unscaled distance from the tree, and accounts for name truncations."""
        ind1 = self.leaves.index(name1)
        ind2 = self.leaves.index(name2)
        return self.orig_dists[ind1, ind2]

    def encode_distance_matrix(self):
        """Takes the current distance matrix, discards the unnecessary values, saves it in a binary format, then decodes that into an ascii representation that can be handled by JSON."""
        flat = flatten_distance_matrix(self.orig_dists)
        with BytesIO() as b:
            np.save(b, flat, allow_pickle=False)
            bin_data = b.getvalue() # Bytes object, can't be JSON serialized
        encoded = base64.encodestring(bin_data).decode('ascii') # str/unicode, can be JSON serialized
        return encoded

    def copy(self):
        """Returns a deep copy of self"""
        # dict.copy() works if all values are immutable, deepcopy(dict) otherwise.
        vf = VariantFinder(tree_input='', verbose=self.verbose, _blank_init=True)
        vf.tree = self.tree.copy()
        vf.tree_size = self.tree_size
        vf.leaves = self.leaves[::]
        vf.index = self.index.copy()
        vf.ordered_names = self.ordered_names[::]
        vf.orig_dists = self.orig_dists.copy()
        vf.newick_tree_data = self.newick_tree_data
        vf.phyloxml_tree_data = self.phyloxml_tree_data
        vf.cache = deepcopy(self.cache)
        vf.normalize = deepcopy(self.normalize)
        vf.display_options = deepcopy(self.display_options)
        vf.selection_groups_order = self.selection_groups_order[::]
        vf.selection_groups_data = deepcopy(self.selection_groups_data)
        vf.file_name = self.file_name
        vf.max_root_distance = self.max_root_distance
        vf._not_ignored_inds = self._not_ignored_inds.copy()
        vf._ignored = self.ignored.copy()
        vf._chosen = self.chosen.copy()
        vf._available = self.available.copy()
        return vf

    # # # # #  Clustering methods  # # # # #
    def _brute_force_clustering(self, num_variants, tolerance, cache, max_cycles):
        avail_medoid_indices = sorted(self.index[n] for n in self.available)
        chsn_tup = tuple(self.index[n] for n in self.chosen)
        dists = self._transform_distances(tolerance)
        cache['cycles_used'] = 0
        best_med_inds, best_score = None, float('inf')
        alt_variants = []
        for avail_inds in itertools.combinations(avail_medoid_indices, num_variants-len(chsn_tup)):
            med_inds = avail_inds + chsn_tup
            score = self._score_pattern(med_inds, dists)
            if score == best_score:
                alt_variants.append(med_inds)
            elif score < best_score:
                best_med_inds, best_score = med_inds, score
                alt_variants = []
            cache['cycles_used'] += 1
            if cache['quit_now'] or max_cycles != None and cache['cycles_used'] >= max_cycles:
                break
        if best_med_inds == None:
            error_msg = 'Error: big problem in brute force clustering, no comparisons were made.'
            return [], error_msg, []
        final_clusters = self._partition_nearest(best_med_inds, self.orig_dists)
        final_scores = self._sum_dist_scores(best_med_inds, final_clusters, self.orig_dists) # Untransformed distances
        return best_med_inds, final_scores, alt_variants
    def _heuristic_rand_starts(self, fxn, args, num_replicates, cache, max_cycles):
        # 'num_replicates' times, initialize with LAB (from FastPAM2) / random chunking, run fxn(), and find the best score
        optima = {}
        cache['cycles_used'] = 0
        replicate_cycles = None
        for i in range(num_replicates):
            if max_cycles != None:
                replicate_cycles = ceil(max_cycles / num_replicates)
            # Requires Python2 compatibility, can't do ... = fxn(*args, replicate_cycles)
            arg_tup = args + (replicate_cycles,)
            variants, scores = fxn(*arg_tup)
            var_tup = tuple(sorted(variants))
            if var_tup in optima:
                optima[var_tup]['count'] += 1
            else:
                optima[var_tup] = {'count':1, 'score':sum(scores), 'variants':variants, 'scores':scores}
        ranked_vars = sorted(optima.keys(), key=lambda opt: optima[opt]['score'])
        best_variants, best_trans_score = optima[ranked_vars[0]]['variants'], sum(optima[ranked_vars[0]]['scores'])
        _final_clusters = self._partition_nearest(best_variants, self.orig_dists)
        final_scores = self._sum_dist_scores(best_variants, _final_clusters, self.orig_dists) # Untransformed distances
        # Find any equally good results
        alt_optima, alt_variants, opt_count = 0, [], optima[ranked_vars[0]]['count']
        if num_replicates > 1:
            for rv in ranked_vars[1:]:
                if optima[rv]['score'] == best_trans_score:
                    alt_optima += 1
                    alt_variants.append(optima[rv]['variants'])
                    opt_count += optima[rv]['count']
                else:
                    break
            if self.verbose:
                self._print_alt_variant_results(num_replicates, optima, ranked_vars, alt_optima, opt_count)
        return best_variants, final_scores, alt_variants
    def _cluster_k_medoids(self, num_variants, tolerance, cache, max_cycles):
        avail_medoid_indices = [self.index[name] for name in self.tree.get_ordered_names() if name in self.available]
        chsn_indices = list(self.index[n] for n in self.chosen)
        num_chsn = len(chsn_indices)
        dists = self._transform_distances(tolerance)
        # This spaces the initial centroids randomly around the tree
        seq_chunk = len(avail_medoid_indices) // (num_variants - num_chsn)
        rand_inds = []
        for i in range(num_variants - num_chsn):
            rand_inds.append(avail_medoid_indices[random.randint(i*seq_chunk, (i+1)*seq_chunk-1)])
        best_med_inds = np.array(chsn_indices + rand_inds)
        # Initial random sets
        best_clusters = self._partition_nearest(best_med_inds, dists)
        best_scores = self._sum_dist_scores(best_med_inds, best_clusters, dists)
        best_score = sum(best_scores)
        if num_chsn == num_variants:
            return best_med_inds, best_scores
        # Using a simple greedy algorithm, typically converges after 2-3 iterations.
        num_cycles = 0
        improvement = True
        while improvement == True:
            improvement = False
            med_inds = best_med_inds.copy()
            for i in range(num_chsn, num_variants):
                for ind in avail_medoid_indices:
                    if ind in med_inds: continue
                    med_inds[i] = ind
                    score = self._score_pattern(med_inds, dists)
                    if score < best_score:
                        best_score = score
                        best_med_inds[i] = ind
                        improvement = True
                    else:
                        med_inds[i] = best_med_inds[i]
                    num_cycles += 1
                    cache['cycles_used'] += 1
                    if cache['quit_now'] or max_cycles != None and num_cycles >= max_cycles:
                        break
                if cache['quit_now'] or max_cycles != None and num_cycles >= max_cycles:
                    improvement = False
                    break
        best_clusters = self._partition_nearest(best_med_inds, dists)
        best_scores = self._sum_dist_scores(best_med_inds, best_clusters, dists)
        return best_med_inds, best_scores
    def _cluster_k_medoids_minibatch(self, num_variants, tolerance, batch_size, cache, max_cycles):
        """Runs a k-medoids clustering approach, but only on a random subsample of the available variants. Yields massive time savings, with only a minor performance hit (often none)."""
        avail_medoid_indices = [self.index[name] for name in self.tree.get_ordered_names() if name in self.available]
        chsn_indices = [self.index[n] for n in self.chosen]
        num_chsn = len(chsn_indices)
        dists = self._transform_distances(tolerance)
        # This spaces the initial centroids randomly around the tree
        seq_chunk = len(avail_medoid_indices) // (num_variants - num_chsn)
        rand_inds = []
        for i in range(num_variants - num_chsn):
            rand_inds.append(avail_medoid_indices[random.randint(i*seq_chunk, (i+1)*seq_chunk-1)])
        best_med_inds = np.array(chsn_indices + rand_inds)
        # Initial random sets
        best_clusters = self._partition_nearest(best_med_inds, dists)
        best_scores = self._sum_dist_scores(best_med_inds, best_clusters, dists)
        best_score = sum(best_scores)
        # Using a simple greedy algorithm, typically converges after 2-5 iterations.
        num_cycles = 0
        improvement = True
        while improvement == True:
            improvement = False
            med_inds = best_med_inds.copy()
            if len(avail_medoid_indices) > batch_size:
                avail_minibatch_inds = random.sample(avail_medoid_indices, batch_size)
            else:
                avail_minibatch_inds = avail_medoid_indices
            for i in range(num_chsn, num_variants):
                for ind in avail_minibatch_inds:
                    if ind in med_inds: continue
                    med_inds[i] = ind
                    score = self._score_pattern(med_inds, dists)
                    if score < best_score:
                        best_score = score
                        best_med_inds[i] = ind
                        improvement = True
                    else:
                        med_inds[i] = best_med_inds[i]
                    num_cycles += 1
                    cache['cycles_used'] += 1
                    if cache['quit_now'] or max_cycles != None and num_cycles >= max_cycles:
                        break
                if cache['quit_now'] or max_cycles != None and num_cycles >= max_cycles:
                    improvement = False
                    break
        best_clusters = self._partition_nearest(best_med_inds, dists)
        best_scores = self._sum_dist_scores(best_med_inds, best_clusters, dists)
        return best_med_inds, best_scores

    def _qt_radius_clustering_greedy(self, min_to_cluster, threshold, cache, max_cycles):
        """Implementation of an adaptation of the QT clustering algorithm. A greedy heuristic, picking new medoids based on the number of unclaimed leaves they cover, with ties broken by the effect each would have on the entire tree score. Then runs a local iterative optimization that I've never seen run for more than 3 cycles. Typically improves overall scores by 5-15%, though it can also drop the number of clusters. Generally doubles or triples the runtime of this function; still extremely fast at 300ms for tree of 1399 and 3s for tree of 4173 (tho it takes 20s when yielding 240 clusters)."""
        chsn_indices = set(self.index[name] for name in self.chosen)
        avail_indices = set(self.index[name] for name in self.available)
        ignrd_indices = [self.index[name] for name in self.ignored]
        nbrs, nbrs_remain, clustered_inds, claimed_inds = self._get_nbrs(threshold, chsn_indices, avail_indices, ignrd_indices)

        # Iteratively find the largest cluster, until enough variants are clustered
        medoids = []
        cache['cycles_used'] = 0
        while len(clustered_inds) < min_to_cluster:
            new_medoid, cur_clstr = self._find_largest_candidate(nbrs, nbrs_remain, claimed_inds)
            if new_medoid == None:
                percent_placed = len(clustered_inds)*100.0/float(len(self._not_ignored_inds))
                error_msg = 'Error: clustering finished prematurely ({:.2f}% placed). To fix this, you may increase the critical threshold, lower the critical percent, or add more available variants.'.format(percent_placed)
                return [], error_msg, [list(chsn_indices)+medoids, self._not_ignored_inds-clustered_inds]
            medoids.append(new_medoid)
            clustered_inds.update(cur_clstr)
            cache['cycles_used'] += 1
            if cache['quit_now'] or max_cycles != None and cache['cycles_used'] >= max_cycles:
                break
        medoids = list(chsn_indices) + medoids
        if ignrd_indices:
            claimed_inds[ignrd_indices,1] = 0.0

        # A local iterative optimization. When considering replacing a medoid, ensures that the leaves all remain covered by the new medoid, or one of the existing ones.
        allowed_to_miss = self.tree_size - min_to_cluster - len(ignrd_indices) # Comes from the Critical percentage
        improved = True
        while improved:
            improved = False
            new_meds = []
            for i, med_ind in enumerate(medoids):
                if med_ind in chsn_indices:
                    new_meds.append(med_ind)
                    continue
                other_meds = new_meds + medoids[i+1:]
                other_raw_dists = self.orig_dists[:,other_meds]
                # Calculate data in claimed_inds as if med_ind wasn't used
                cur_clstr_mask = claimed_inds[:,0]==med_ind
                other_dists = np.fromiter((other_raw_dists[ind,:].min() if cur_clstr_mask[ind] else claimed_inds[ind,1] for ind in range(self.tree_size)), dtype=np.dtype('float64')) # Doing it this complex way to avoid recalculations
                other_best_meds = np.fromiter((other_meds[other_raw_dists[ind,:].argmin()] if cur_clstr_mask[ind] else claimed_inds[ind,0] for ind in range(self.tree_size)), dtype=np.dtype('float64'))
                # Check if the medoid can be entirely removed
                if np.sum(other_dists > threshold) <= allowed_to_miss:
                    np.copyto(claimed_inds[:,0], other_best_meds)
                    np.copyto(claimed_inds[:,1], other_dists)
                    improved = True
                    continue
                # Check nbrs of med_ind to see if any improve the clustering
                cur_nbrs = np.fromiter((x for x in np.flatnonzero(nbrs[:,med_ind]) if x not in other_meds and x in avail_indices), dtype=np.dtype('int64'))
                nbr_dists = self.orig_dists[:,cur_nbrs]
                other_dists = np.expand_dims(other_dists, 1) # Creates a view for broadcasting
                nbr_is_closest = nbr_dists < other_dists
                min_dists = np.where(nbr_is_closest, nbr_dists, other_dists) # Dist to nearest medoid (other or nbr or med_ind)
                # Deal with distances beyond the threshold
                beyond_threshold = min_dists > threshold
                if allowed_to_miss == 0:
                    min_dists[beyond_threshold] = np.inf
                    scores = min_dists.sum(axis=0)
                else:
                    scores = min_dists.sum(axis=0)
                    for ind in range(len(cur_nbrs)):
                        nbr_beyond = beyond_threshold[:,ind]
                        if nbr_beyond.sum() > allowed_to_miss:
                            scores[ind] = np.inf
                        else:
                            scores[ind] -= min_dists[nbr_beyond,ind].sum() # If a leaf can be skipped, it no longer affects the choice of medoid
                # Identify best new medoid
                best_nbrs = np.take(cur_nbrs, np.flatnonzero(scores == scores.min()))
                if med_ind in best_nbrs: # Prevents endless swapping between equivalent medoids
                    new_meds.append(med_ind)
                else:
                    best_nbr_ind = scores.argmin()
                    best_med = cur_nbrs[best_nbr_ind]
                    new_meds.append(best_med)
                    np.copyto(claimed_inds[:,0], np.where(nbr_is_closest[:,best_nbr_ind], best_med, other_best_meds))
                    np.copyto(claimed_inds[:,1], min_dists[:,best_nbr_ind])
                    improved = True
            if improved:
                medoids = new_meds
            cache['cycles_used'] += 1
            if cache['quit_now'] or max_cycles != None and cache['cycles_used'] >= max_cycles:
                break
        medoid_scores = {med:0 for med in medoids}
        for ind in self._not_ignored_inds:
            med = int(claimed_inds[ind,0])
            if med == -1:
                med = medoids[self.orig_dists[ind,medoids].argmin()]
            medoid_scores[med] += self.orig_dists[ind,med]
        final_scores = [medoid_scores[med] for med in medoids]
        alt_variants = []
        return medoids, final_scores, alt_variants

    def _find_largest_candidate(self, nbrs, nbrs_remain, claimed_inds):
        """Identifies the index of the variant with the most close neighbours that have not yet been claimed. Ties are broken by considering the impact on the overall tree score. Returns the index of chosen medoid, and an array of indices representing the variants in that cluster (including the cluster centre). Modifies nbrs_remain and claimed_inds."""
        unclaimed_nbrs = nbrs_remain.sum(axis=0)
        max_nbrs = unclaimed_nbrs.max()
        if max_nbrs == 0:
            return None, []
        med_inds = np.flatnonzero(unclaimed_nbrs == max_nbrs)
        if len(med_inds) == 1:
            new_medoid = med_inds[0]
            clstr_inds = np.flatnonzero((self.orig_dists[:,new_medoid] < claimed_inds[:,1]) & nbrs[:,new_medoid])
        else:
            # Calculations are all vectorized over med_inds
            new_dists = self.orig_dists[:,med_inds] # Reduce the size of the working object
            claimed_dists = claimed_inds[:,[1]]
            nearest = np.less(new_dists, claimed_dists) & nbrs[:,med_inds] # Includes claimed and unclaimed; excludes ignored
            existing_dists = np.nan_to_num(claimed_dists, posinf=0.0) # Convert unclaimed to 0
            old_dists = np.where(nearest, existing_dists, 0).sum(axis=0) # Previously claimed, to be replaced by med
            med_scores = np.where(nearest, new_dists, 0).sum(axis=0) - old_dists
            best_score_ind = med_scores.argmin()
            new_medoid = med_inds[best_score_ind]
            clstr_inds = np.flatnonzero(nearest[:,best_score_ind])
        # Update claimed_inds
        np.put(claimed_inds[:,0], clstr_inds, new_medoid)
        np.put(claimed_inds[:,1], clstr_inds, self.orig_dists[clstr_inds,new_medoid])
        # Update nbr tracker 
        nbrs_remain[:,new_medoid] = False
        nbrs_remain[clstr_inds,:] = False
        #nbrs_remain[:,clstr_inds] = False Don't do this. Sometimes a leaf that has been claimed already will make a good cluster medoid. Falsing the columns prevents that from being considered.
        return new_medoid, clstr_inds

    def _qt_radius_clustering_minimal(self, min_to_cluster, reduced, unassigned_orphans, cache, max_cycles):
        """In the case where all sequences are classified as available, finding cluster centers is equivalent to the dominating set problem. It is similar to the vertex cover problem, and every vertex cover is a dominating set, but dominating sets don't need to include every edge in the graph.
        This implementation is a little different than a typical one, because of the available & unassigned variants. In a normal implementation, every variant is always guaranteed to be able to be placed into a cluster, to form a singleton if nothing else. But there may be no available variant within threshold distance of some unassigned variant. Or worse, the nearest available variant may be assigned to some other cluster, stranding some unassigned variants. This one is greedy(? what do i mean).
        Use constraint propagation with branch/bound; once we find a valid solution, any configuration that yields the same number/more clusters can be pruned. Don't think I can use the total score to prune, but I can prune if too many unassigned are stranded (more than the allowed miss %)."""
        # Separating components and removing dominated indices reduced runtime on tbpb82 0.4@100% from 10s to 10ms.
        # Before removing dominated, tree_275 0.04@100% found a solution with score 4.0485 after 228k cycles. After, found it in 49k. After adding the second Counter to CoverManager, found it under 1k cycles. Each cycle was substantially slower, but the solution still was found ~1000x faster (ms instead of 20 min).
        out_of_range = reduced.copy()
        out_of_range[out_of_range != 0] = 1
        neighbors_of = {}
        for ind in self._not_ignored_inds:
            clstr_inds = np.nonzero(reduced[:,ind] == 0)[0]
            neighbors_of[ind] = set(clstr_inds)
        chsn_indices = set(self.index[name] for name in self.chosen)
        avail_indices = set(self.index[name] for name in self.available)
        num_not_ignored = len(self._not_ignored_inds)
        considered_nbrs, dominated_inds = self._remove_dominated_inds(neighbors_of, chsn_indices, avail_indices, out_of_range)
        # #  Process depending on the run parameters
        cache['cycles_used'] = 0
        final_centre_inds, final_scores = [], []
        if min_to_cluster == num_not_ignored: # Critical percent equivalent to 100%
            # Can dramatically speed up the search by separating components
            component_inds = self._identify_components(neighbors_of)
            subset_cycles, cycle_rollover = None, 0
            for subset_indices in component_inds:
                subset_to_cluster = len(subset_indices)
                subset_chosen = chsn_indices & subset_indices
                subset_avail = avail_indices & subset_indices
                if max_cycles != None:
                    subset_cycles = ceil(subset_to_cluster/float(min_to_cluster) * max_cycles) + cycle_rollover
                subset_centre_inds, subset_scores, subset_cycles_used = self._qt_radius_cluster_subset(subset_indices, subset_chosen, subset_avail, considered_nbrs, dominated_inds, subset_to_cluster, cache, subset_cycles, out_of_range)
                if subset_cycles_used == None or subset_cycles_used >= subset_cycles:
                    cycle_rollover = 0
                else:
                    cycle_rollover = subset_cycles - subset_cycles_used
                final_centre_inds.extend(subset_centre_inds)
                final_scores.extend(subset_scores)
        elif min_to_cluster == num_not_ignored - len(unassigned_orphans):
            # Can still use the component speedup in this case
            orphan_inds = set(unassigned_orphans)
            component_inds = self._identify_components(neighbors_of)
            subset_cycles, cycle_rollover = None, 0
            for subset_indices in component_inds:
                if max_cycles != None:
                    subset_cycles = ceil(len(subset_indices)/float(min_to_cluster) * max_cycles) + cycle_rollover
                subset_to_cluster = len(subset_indices - orphan_inds)
                if subset_to_cluster == 0: # The entire subset is orphaned, so no centers can be found
                    if max_cycles != None:
                        cycle_rollover += subset_cycles
                    continue
                subset_chosen = chsn_indices & subset_indices
                subset_avail = avail_indices & subset_indices
                subset_centre_inds, subset_scores, subset_cycles_used = self._qt_radius_cluster_subset(subset_indices, subset_chosen, subset_avail, considered_nbrs, dominated_inds, subset_to_cluster, cache, subset_cycles, out_of_range)
                if subset_cycles_used == None or subset_cycles_used >= subset_cycles:
                    cycle_rollover = 0
                else:
                    cycle_rollover = subset_cycles - subset_cycles_used
                final_centre_inds.extend(subset_centre_inds)
                final_scores.extend(subset_scores)
        else:
            # Can't split into components and guarantee optimal, as I can't predict which component should be allowed to miss some variants.
            # May be a way to remove some components from consideration, but likely requires running _qt_radius_cluster_subset() multiple times. May still be faster, so worth considering if more speed is actually useful here.
            #  - All unassigned orphans are part of total_allowed_missed by definition. So all other clusters are only allowed to miss allowed_missed = total_allowed_missed - len(unassigned_orphans).
            #  - The global optimal solution for some component is guaranteed to fall between the solution for that component finding 100% of variants, and the solution for that component finding len(component)-allowed_missed variants. If they are equal, that's the global optimal solution for that component, and it can be excluded from the combined run. If they're unequal, it was a waste of time and the component has to be included in the combined run.
            final_centre_inds, final_scores, _cycles_used = self._qt_radius_cluster_subset(set(neighbors_of.keys()), chsn_indices, avail_indices, considered_nbrs, dominated_inds, min_to_cluster, cache, max_cycles, out_of_range)
        alt_variants = []
        return final_centre_inds, final_scores, alt_variants

    def _qt_radius_cluster_subset(self, subset_indices, subset_chosen, subset_avail, considered_nbrs, dominated_inds, subset_to_cluster, cache, subset_cycles, out_of_range):
        subset_centre_inds, subset_scores, subset_cycles_used = [], [], None
        subset_len, subset_chosen_len, subset_avail_len = len(subset_indices), len(subset_chosen), len(subset_avail)
        # #  Trivial subset configurations
        if subset_chosen_len == subset_avail_len == 0:
            # No avil and no chosen: subset is entirely unassigned orphans
            return subset_centre_inds, subset_scores, subset_cycles_used
        elif subset_avail_len == 0: # Must take all chosen
            # No avail but 1 or more chosen: centres must be exactly equal to the chosen.
            subset_centre_inds = list(subset_chosen)
            cluster_inds = self._partition_nearest(subset_centre_inds, self.orig_dists, only_these=subset_indices)
            subset_scores = self._sum_dist_scores(subset_centre_inds, cluster_inds, self.orig_dists)
            return subset_centre_inds, subset_scores, subset_cycles_used
        elif subset_len == 1:
            # It must be avail, not a chosen or unassigned.
            subset_centre_ind = next(iter(subset_indices)) # Gets value without modifying the set
            subset_score = 0.0
            return [subset_centre_ind], [subset_score], subset_cycles_used
        elif subset_avail_len == 1 and subset_chosen_len == 0:
            # The 1 avail is the only possible centre.
            subset_centre_ind = next(iter(subset_avail))
            other_inds = list(subset_indices - subset_avail)
            subset_score = np.sum(self.orig_dists[other_inds,subset_centre_ind])
            return [subset_centre_ind], [subset_score], subset_cycles_used
        elif subset_len == 2:
            # May be 1 avail and 1 chosen, or 2 avail.
            if subset_chosen_len == 1:
                subset_centre_ind = next(iter(subset_chosen))
                other_ind = (subset_indices - subset_chosen).pop()
            else: # Doesn't matter which avail we choose.
                subset_avail_iter = iter(subset_avail)
                subset_centre_ind = next(subset_avail_iter)
                other_ind = next(subset_avail_iter)
            subset_score = self.orig_dists[other_ind,subset_centre_ind]
            return [subset_centre_ind], [subset_score], subset_cycles_used
        # #  Non-trivial subsets
        subset_nbrs = {ind:considered_nbrs[ind] for ind in subset_indices if ind in considered_nbrs}
        cover_manager = CoverManager(subset_to_cluster, subset_nbrs, self.orig_dists, cache, subset_cycles, chosen=subset_chosen)
        if len(cover_manager.cur_covered) >= subset_to_cluster: # The chosen are sufficient
            subset_centre_inds = list(subset_chosen)
            cluster_inds = self._partition_nearest(subset_centre_inds, self.orig_dists, only_these=subset_indices)
            subset_scores = self._sum_dist_scores(subset_centre_inds, cluster_inds, self.orig_dists)
        else:
            subset_centre_inds, recursive_score = self._recursive_qt_cluster(subset_to_cluster, cover_manager, list(subset_nbrs), np.inf)
            if subset_cycles == None: # optimal solution was found
                subset_centre_inds = self._test_dominated_inds(subset_centre_inds, recursive_score, dominated_inds)
            else:
                if cover_manager.cycle < subset_cycles: # optimal solution was found
                    subset_centre_inds = self._test_dominated_inds(subset_centre_inds, recursive_score, dominated_inds)
                    subset_cycles_used = cover_manager.cycle
                else: # max_cycles reached, no optimality guarantee
                    subset_centre_inds = self._single_pass_optimize(subset_centre_inds, recursive_score, subset_to_cluster, subset_nbrs)
                    subset_cycles_used = subset_cycles
            cluster_inds = self._partition_nearest(subset_centre_inds, self.orig_dists, only_these=subset_indices)
            subset_scores = self._sum_dist_scores(subset_centre_inds, cluster_inds, self.orig_dists)
        return subset_centre_inds, subset_scores, subset_cycles_used


    def _recursive_qt_cluster(self, min_to_cluster, cover_manager, best_centre_inds, best_score):
        # Once a valid solution of length N is encountered, optimal or not, there is no reason to check all other possible solutions of length N formed by swapping the most recent index. Assuming N-1 indices was optimal, the greedy choice of the last index is guaranteed optimal. If this solution is not optimal, then you'd have to go back in the recursive stack to change the N-1 index, if not further.

        if cover_manager.cycle % 1000 == 0:
            print(cover_manager.cycle, len(best_centre_inds), best_centre_inds, best_score) # TESTING

        if len(cover_manager.centre_inds) >= len(best_centre_inds):
            # Already have a guaranteed better solution. Using ">=" as the new centre hasn't been added yet
            return best_centre_inds, best_score
        next_ind, score, num_covered = cover_manager.next_index()
        if next_ind == None: # Indicates a short-circuit cut of this branch
            return best_centre_inds, best_score
        cover_manager.add_centre(next_ind) # Select next_ind and assume it's a centre
        cover_manager.blacklist(next_ind) # Ensures ind isn't selected again down this branch
        # Check if it's a valid configuration
        continue_recursion = True
        if num_covered >= min_to_cluster:
            continue_recursion = False
            cover_manager.greedy_found = True
            if len(cover_manager.centre_inds) < len(best_centre_inds) or (len(cover_manager.centre_inds) == len(best_centre_inds) and score < best_score):
                best_centre_inds, best_score = cover_manager.centre_inds[::], score
        elif len(cover_manager.centre_inds) == len(best_centre_inds):
            # We already have a valid solution of this size, this one isn't valid and can't get any better.
            continue_recursion = False
        else:
            # Current set of inds not yet valid, is smaller than the current best solution, so keep building it.
            best_centre_inds, best_score = self._recursive_qt_cluster(min_to_cluster, cover_manager, best_centre_inds, best_score)
        cover_manager.remove_centre(next_ind) # Then assume next_ind is excluded from centres
        # Prune the branch if we got to a valid config, as it can't be improved
        if continue_recursion:
            best_centre_inds, best_score = self._recursive_qt_cluster(min_to_cluster, cover_manager, best_centre_inds, best_score)
        cover_manager.whitelist(next_ind) # Allows ind to be selected again down another branch
        return best_centre_inds, best_score

    def _single_pass_optimize(self, best_centre_inds, best_score, min_to_cluster, nbrs):
        """Quite fast (took 7 sec on tree_4173 with 7 centres), slows considerably as centres increase."""
        def score_inds(vals):
            inds, ind = vals
            other_best_inds.append(ind)
            score = np.sum(np.min(self.orig_dists[np.ix_(inds,other_best_inds)], axis=1))
            other_best_inds.pop()
            return (score, ind)
        #dists = self.orig_dists.copy() If I zero out rows I don't need, I don't have to use ix_() which is 2x as fast. Probably doesn't matter, fast enough.
        best_centre_inds = best_centre_inds[::]
        inds_to_try = list(nbrs)
        for i in range(len(best_centre_inds)):
            other_best_inds = best_centre_inds[:i] + best_centre_inds[i+1:]
            cur_covered_set = set().union(*(nbrs[ind] for ind in other_best_inds))
            cvrd_inds = [list(cur_covered_set | nbrs[ind]) for ind in inds_to_try]
            valid_cvrd_inds = [(inds, ind) for inds, ind in zip(cvrd_inds, inds_to_try) if len(inds) >= min_to_cluster]
            score_vals = map(score_inds, valid_cvrd_inds)
            best_score, best_ind = min(score_vals)
            best_centre_inds[i] = best_ind
        return best_centre_inds

    def _identify_components(self, neighbors_of):
        """Runs trivially fast, under 100ms even for a tree of size 4173."""
        components, cur_component = [], set()
        not_visited, to_visit = set(neighbors_of.keys()), set()
        while len(not_visited) > 0:
            if len(to_visit) == 0:
                if len(cur_component) > 0:
                    components.append(cur_component)
                    cur_component = set()
                cur_ind = not_visited.pop()
            else:
                cur_ind = to_visit.pop()
                not_visited.remove(cur_ind)
            nbrs = neighbors_of[cur_ind]
            cur_component.update(nbrs)
            to_visit.update(nbrs & not_visited)
        if len(cur_component) > 0:
            components.append(cur_component)
        return components

    def _reduce_distances(self, threshold):
        """Returns a copy of the distance matrix, where all distances <= threshold are set to 0. Removes the ignored variants from consideration by setting their columns and rows to inf. If the given threshold is infeasible, returns ([], num_orphans) to indicate an error."""
        reduced = self.orig_dists.copy()
        reduced[reduced <= threshold] = 0
        # Remove ignored from all consideration
        ignrd_indices = [self.index[name] for name in self.ignored]
        if ignrd_indices:
            reduced[:,ignrd_indices] = np.inf
            reduced[ignrd_indices,:] = np.inf
        # Check if the given parameters are feasible
        chsn_indices = set(self.index[name] for name in self.chosen)
        avail_indices = set(self.index[name] for name in self.available)
        ca_indices = chsn_indices | avail_indices
        unassigned_indices = np.array(list(self._not_ignored_inds - ca_indices))
        if len(unassigned_indices) == 0:
            unassigned_orphans = unassigned_indices
        else:
            ca_indices = list(ca_indices)
            avail_in_range = np.count_nonzero(reduced[np.ix_(unassigned_indices,ca_indices)] == 0, axis=1)
            unassigned_orphans = unassigned_indices[avail_in_range == 0]
        return reduced, unassigned_orphans
    
    def _get_nbrs(self, threshold, chsn_indices, avail_indices, ignrd_indices):
        """nbrs is a 2D boolean array where a column nbrs[:,ind] gives you a boolean mask for all neighbours of ind. Setting a column to all False removes that index from consideration as a medoid. Setting a row to all False removes that index from counting as unclaimed."""
        nbrs = self.orig_dists <= threshold  # very fast to calculate; 17MB for a tree of 4173
        unassigned_indices = list(self._not_ignored_inds - avail_indices - chsn_indices)
        if unassigned_indices:
            # Remove unassigned from centre consideration
            nbrs[:,unassigned_indices] = False
        if ignrd_indices:
            # Remove ignored from all consideration so they have zero impact.
            nbrs[ignrd_indices,:] = False
            nbrs[:,ignrd_indices] = False
        nbrs_remain = nbrs.copy() # Working copy of nbrs
        
        # claimed_inds is a tree_size x 2 array, where the first column holds -1, or the medoid ind once that row has been claimed; the second column holds the distance to that medoid. Note that because it is one array, the first column holds floats of the indices, will need to convert to int if used as an index
        claimed_inds = np.zeros((self.tree_size, 2))
        claimed_inds[:,0] = -1
        claimed_inds[:,1] = np.inf

        # Fill out the chosen
        clustered_inds = set()
        for chsn_ind in chsn_indices:
            cur_clstr = np.flatnonzero(nbrs[:,chsn_ind])
            clustered_inds.update(cur_clstr)
            # Remove chosen and their clusters from consideration
            nbrs_remain[:,chsn_ind] = False # Remove chosen from consideration as medoids
            nbrs_remain[cur_clstr,:] = False # Remove cluster from counting as unclaimed
            # Record the relations in claimed_inds
            to_claim = np.less(self.orig_dists[:,chsn_ind], claimed_inds[:,1], where=nbrs[:,chsn_ind])
            np.putmask(claimed_inds[:,0], to_claim, chsn_ind)
            np.putmask(claimed_inds[:,1], to_claim, self.orig_dists[:,chsn_ind])
        return nbrs, nbrs_remain, clustered_inds, claimed_inds

    def _transform_distances(self, tolerance):
        """A parameter used to make the k-based clustering methods less sensitive to outliers. When tolerance=1 it has no effect; when tolerance>1 clusters are more accepting of large branches, and cluster sizes tend to be more similar; when tolerance<1 clusters are less accepting of large branches, and cluster sizes tend to vary more. The transformed distances are then normalized to the max value of the untransformed distances. Also sets all ignored rows and columns to 0."""
        try:
            tolerance = float(tolerance)
        except:
            raise NavargatorValueError('Error: tolerance must be a number.')
        if tolerance <= 0.0:
            raise NavargatorValueError('Error: tolerance must be a strictly positive number.')
        if tolerance == 1.0:
            dists = self.orig_dists.copy()
        else:
            dists = np.power(self.orig_dists.copy()*tolerance + 1.0, 1.0/tolerance) - 1.0
        for name in self.ignored:
            ind = self.index[name]
            dists[ind,:] = 0
            dists[:,ind] = 0
        return dists

    def _remove_dominated_inds(self, neighbors_of, chsn_indices, avail_indices, out_of_range):
        # I need to change the "dominated" terms. Since qt is doing real dominated sets. This function is actually identifying cliques! Mostly. All members of a clique will have the same set of neighbours, except for the nodes in the clique connected to the rest of the graph. We collapse the identical ones.

        # Is not a "dominating set" from graph theory. Here, one variant dominates others if they all have identical neighbours under the threshold, and the one variant is the most central (lowest summed distance to other variants).
        # Removing these dominated inds from consideration dramatically speeds up the algorithm, and still guarantees to find the optimal minimum set cover. In some cases the score (but not the clustering pattern) may be slightly non-optimal, which is remedied by _test_dominated_inds().
        considered_nbrs, dominated_inds, repeated_inds = {}, {}, set()
        uniq_nbrs, count = np.unique(out_of_range.T, axis=0, return_counts=True)
        repeated_nbrs = uniq_nbrs[count > 1]
        for rep_nbrs in repeated_nbrs:
            rep_inds = np.argwhere(np.all(out_of_range.T == rep_nbrs, axis=1)).ravel() # Inds with identical columns in out_of_range
            rep_inds_set = set(rep_inds)
            repeated_inds.update(rep_inds_set)
            chsn_rep_inds = chsn_indices & rep_inds_set
            if len(chsn_rep_inds) != 0: # If any chosen in the set, they are the only valid choices
                for chsn_ind in chsn_rep_inds:
                    considered_nbrs[chsn_ind] = neighbors_of[chsn_ind]
            else:
                avail_reps = [rep_ind for rep_ind in rep_inds if rep_ind in avail_indices]
                if len(avail_reps) != 0:
                    common_nbrs = list(neighbors_of[avail_reps[0]])
                    best_ind = avail_reps[np.argmin(np.sum(self.orig_dists[np.ix_(common_nbrs,avail_reps)], axis=0))] # Most central of the rep_inds
                    considered_nbrs[best_ind] = neighbors_of[best_ind]
                    dom_ca_inds = avail_indices & rep_inds_set
                    dom_ca_inds.remove(best_ind)
                    if len(dom_ca_inds) > 0:
                        dominated_inds[best_ind] = dom_ca_inds
        for uniq_ind in (chsn_indices | avail_indices) - repeated_inds:
            considered_nbrs[uniq_ind] = neighbors_of[uniq_ind]
        return considered_nbrs, dominated_inds
    def _test_dominated_inds(self, cur_centre_inds, best_score, dominated_inds):
        # All keys in dominated_inds are by definition available.
        final_centre_inds = cur_centre_inds[::]
        for i, best_ind in enumerate(final_centre_inds):
            if best_ind not in dominated_inds:
                continue
            for ind in dominated_inds[best_ind]:
                final_centre_inds[i] = ind
                score = self._score_pattern(final_centre_inds, self.orig_dists)
                if score < best_score:
                    best_score = score
                    best_ind = ind
            final_centre_inds[i] = best_ind
        return final_centre_inds


    def _score_pattern(self, centres, dists, only_these=[]):
        """Approximately 2-4x faster then _partition_nearest() and _sum_dist_scores(); twice as fast again if only_these is empty."""
        if len(only_these) == 0:
            return np.sum(np.min(dists[:,centres], axis=1))
        else:
            return np.sum(np.min(dists[np.ix_(only_these,centres)], axis=1))
    def _partition_nearest(self, medoids, dists, only_these=set()):
        """Given an array of indices, returns a list of lists, where the ith sublist contains the indices of the nodes closest to the ith medoid in inds."""
        if len(only_these) == 0:
            allowed_inds = self._not_ignored_inds
        else:
            allowed_inds = self._not_ignored_inds & only_these
        closest_medoid_ind = np.argmin(dists[:,medoids], 1) # If len(medoids)==3, would look like [2,1,1,0,1,2,...].
        clusts = [[] for i in medoids]
        for node_ind, med_ind in enumerate(closest_medoid_ind):
            if node_ind in allowed_inds:
                clusts[med_ind].append(node_ind)
        return clusts
    def _sum_dist_scores(self, medoids, clusters, dists):
        return [sum(dists[med,inds]) for med,inds in zip(medoids,clusters)]

    # # # # #  Private methods  # # # # #
    def _clear_cache(self, reset_normalize=True):
        """self.cache = {'run_id1':{cache_data}, 'run_id2':{}..., 'params':{(params1):'run_id1', ...}}"""
        self.cache = {'params':{}}
        if reset_normalize:
            self.normalize = self._empty_normalize()
    def _calculate_cache_values(self, run_id, params, variant_inds, scores, alt_variants):
        """Fills out the self.cache entry for the given clustering run. 'variant_inds'=np.array(variant_indices_1); 'scores'=[clust_1_score, clust_2_score,...]; 'alt_variants'=[np.array(variant_indices_2), np.array(variant_indices_3),...]. If the clustering run terminated with an error, variant_inds=[] and scores is the given error message."""
        self.cache['params'][params] = run_id
        run_length = time.time() - self.cache[run_id]['run_time']
        print('run time', self.cache[run_id]['method'], run_length) # TEST
        if len(variant_inds) == 0:
            self.cache[run_id].update( {'status':'error', 'error_message':scores, 'run_time':run_length} )
            return
        cluster_inds = self._partition_nearest(variant_inds, self.orig_dists)
        variants = [self.leaves[i] for i in variant_inds]
        clusters = [[self.leaves[i] for i in clst] for clst in cluster_inds]
        variant_distance, max_var_dist = {}, 0
        for rep_ind, clst_inds in zip(variant_inds, cluster_inds):
            for var_ind in clst_inds:
                dist = self.orig_dists[rep_ind, var_ind]
                variant_distance[self.leaves[var_ind]] = dist
                if dist > max_var_dist:
                    max_var_dist = dist
        self.cache[run_id].update( {'status':'done', 'run_time':run_length, 'variants':variants, 'scores':scores, 'clusters':clusters, 'variant_distance':variant_distance, 'max_distance':max_var_dist, 'alt_variants':alt_variants} )
    def _empty_normalize(self):
        """'method' can be one of 'self', 'global', or 'custom'."""
        return {'method':'self', 'custom_value':None, 'custom_max_count':0, 'global_value':None, 'global_max_count':0, 'processed':set(), 'global_bins':[]}
    def _calc_max_root_dist(self):
        max_dist = 0.0
        root = self.tree.root
        for node in self.tree.leaves:
            dist = self.tree.node_distance(root, node)
            if dist > max_dist:
                max_dist = dist
        return max_dist
    def _print_clustering_results(self, num_variants, variants, scores, alt_variants):
        if alt_variants:
            print('Found %i equal sets of %i representative variants.' % (len(alt_variants)+1, num_variants))
            alt_var_buff = []
            for avars in alt_variants:
                alt_var_buff.append( 'Alternate variants: %s' % ', '.join(sorted(self.leaves[var_ind] for var_ind in avars)) )
            print('\n%s' % ('\n'.join(alt_var_buff)))
        else:
            print('Found %i representative variants.' % num_variants)
        variant_names = ', '.join(sorted(self.leaves[v] for v in variants))
        print('\nBest score: %f\nBest variants: %s' % (sum(scores), variant_names))
    def _print_alt_variant_results(self, num_replicates, optima, ranked_vars, alt_optima, opt_count):
        optima_percent = round(opt_count * 100.0 / num_replicates, 0)
        if len(ranked_vars) == 1:
            print('One unique solution found after {} replicates.'.format(num_replicates))
        elif alt_optima == 0:
            imprv_percent = round((optima[ranked_vars[1]]['score'] - optima[ranked_vars[0]]['score']) * 100.0 / optima[ranked_vars[0]]['score'], 1)
            print('{} solutions found after {} replicates; {}% consensus for the optimum ({:.1f}% improvement over solution #2).'.format(len(ranked_vars), num_replicates, optima_percent, imprv_percent))
        else:
            print('{} solutions found after {} replicates; {}% consensus for the optimum (from {} equivalent solutions).'.format(len(ranked_vars), num_replicates, optima_percent, alt_optima+1))

    # # # # #  Variable validation methods  # # # # #
    def _validate_clustering_method(self, method, num_possible_combinations):
        if method == None:
            if num_possible_combinations <= self._max_brute_force_attempts:
                method = 'brute force'
            else:
                method = 'k medoids'
        else:
            method = method.lower()
        if method not in self._cluster_methods:
            raise NavargatorValueError('Error: the given clustering method "{}" is not supported (must be one of: {}).'.format( method, ', '.join(sorted(self._cluster_methods)) ))
        return method
    def _validate_node_name(self, node):
        node = node.strip()
        if node not in self.index:
            raise NavargatorValueError('Error: could not add "{}" to the assigned set, as it was not found in the tree.'.format(node))
        return node

    # # # # #  Accessible attribute logic  # # # # #
    @property
    def chosen(self):
        return self._chosen
    @chosen.setter
    def chosen(self, names):
        new_chosen = set()
        for node in names:
            node = self._validate_node_name(node)
            if node in self.ignored:
                self._ignored.remove(node)
            if node in self.available:
                self._available.remove(node)
            new_chosen.add(node)
        if new_chosen != self._chosen:
            self._chosen = new_chosen
            self._clear_cache()
    @property
    def ignored(self):
        return self._ignored
    @ignored.setter
    def ignored(self, names):
        new_ignored = set()
        new_ingroup_inds = set(range(self.tree_size))
        for node in names:
            node = self._validate_node_name(node)
            if node in self.available:
                self._available.remove(node)
            if node in self.chosen:
                self._chosen.remove(node)
            new_ingroup_inds.remove(self.index[node])
            new_ignored.add(node)
        if new_ignored != self._ignored:
            self._ignored = new_ignored
            self._not_ignored_inds = new_ingroup_inds
            self._clear_cache()
    @property
    def available(self):
        return self._available
    @available.setter
    def available(self, names):
        new_avail = set()
        for node in names:
            node = self._validate_node_name(node)
            if node in self.chosen:
                self._chosen.remove(node)
            if node in self.ignored:
                self._ignored.remove(node)
            new_avail.add(node)
        if new_avail != self._available:
            self._available = new_avail
            self._clear_cache()


class CoverManager(object):
    """Used by the _qt_radius_clustering_minimal() method to track variants covered by different combinations of centre variants. Intelligently chooses the next potential centre ind."""
    def __init__(self, min_covered, nbrs, dists, vf_cache, max_cycles=None, chosen=set()):
        self.min_covered = min_covered
        self.max_cycles = max_cycles
        self.cycle = 0
        self.nbrs = nbrs
        self.dists = dists
        self.vf_cache = vf_cache
        self.inds_to_try = set(nbrs) - chosen
        self.centre_inds = []
        self.greedy_found = False
        self.cur_covered = Counter()
        self.remaining_coverage = Counter()
        self._empty = Counter()
        for ind in chosen:
            self.add_centre(ind)
        for ind in self.inds_to_try:
            self.remaining_coverage.update(nbrs[ind])
    def add_centre(self, centre_ind):
        self.cur_covered.update(self.nbrs[centre_ind])
        self.centre_inds.append(centre_ind)
    def remove_centre(self, centre_ind):
        self.cur_covered.subtract(self.nbrs[centre_ind])
        self.cur_covered += self._empty # Removes 0s. Faster to do this than self.cur_covered | self._empty
        self.centre_inds.pop()
    def next_index(self):
        def score_max_coverage(inds):
            # Sorts by num_covered, then by score
            # By far the slowest part. The entire qt algorithm is 5x slower if self.inds_to_try isn't filtered
            ind = inds.pop() # Done this way because I don't trust set order to be stable
            self.centre_inds.append(ind)
            score = np.sum(np.min(self.dists[np.ix_(inds,self.centre_inds)], axis=1))
            self.centre_inds.pop()
            return (len(inds), -score, ind)
        if self.greedy_found:  # Can't exit until a valid solution has been found
            if self.vf_cache['quit_now'] or self.max_cycles != None and self.cycle >= self.max_cycles:
                return None, np.inf, 0
        if len(self.cur_covered | self.remaining_coverage) < self.min_covered:
            # Also ensures len(self.inds_to_try)!=0 && len(self.nbrs[ind]-self.cur_covered)!=0
            return None, np.inf, 0
        self.cycle += 1
        self.vf_cache['cycles_used'] += 1
        cur_covered_set = set(self.cur_covered)
        cvrd_inds = [list(cur_covered_set | self.nbrs[ind])+[ind] for ind in self.inds_to_try]
        #print(len(cvrd_inds), len(cur_covered_set), len(self.cur_covered | self.remaining_coverage))
        max_cvrd = len(max(cvrd_inds, key=len))
        score_vals = map(score_max_coverage, filter(lambda inds: len(inds)==max_cvrd, cvrd_inds))
        num_cvrd, neg_score, next_ind = max(score_vals)
        return next_ind, -neg_score, num_cvrd
    def blacklist(self, centre_ind):
        self.inds_to_try.remove(centre_ind)
        self.remaining_coverage.subtract(self.nbrs[centre_ind])
        #self.remaining_coverage += self._empty  # Removes 0s, but not needed and faster to omit
    def whitelist(self, centre_ind):
        self.inds_to_try.add(centre_ind)
        self.remaining_coverage.update(self.nbrs[centre_ind])
    def __len__(self):
        return len(self.cur_covered)
