"""
Defines the following public functions:
  load_navargator_file(file_path)
"""
import os, sys, itertools, random, time, base64
from math import log, exp, ceil
from io import BytesIO
from copy import deepcopy
import numpy as np
from navargator_resources import phylo
from navargator_resources.navargator_common import NavargatorValidationError, NavargatorValueError, NavargatorRuntimeError

phylo.verbose = False

# TODO:
# - Finish / clean up _qt_radius_clustering().
#   - Ensure the greedy and optimal are working as intended. I thought I saw some weird behavior on tbpb59 around t=0.2 or 0.3
# - Look to a non-greedy implementation that should be much better for our goals
# - Implement threshold clustering.
#   - Holy shit I think it's deterministic. So single run is enough
#   - Orig article: https://genome.cshlp.org/content/9/11/1106.full
#   - Thesis describing optimizations on it: https://nsuworks.nova.edu/cgi/viewcontent.cgi?referer=https://www.google.ca/&httpsredir=1&article=1042&context=gscis_etd
#   - Considering allowing user to specify ex 90% of variants within threshold. What happens to the remaining? Added to nearest cluster center (probably) or specified as unclustered? Should user be allowed to choose? If so, probably works to push unclustered into "ignored" for results page.
#   - How do the chosen factor in? They can't be added to any candidate cluster, as they must be cluster centers. Maybe one iteration with only chosen as candidates, then continue with the rest of the available.
#   - Check if variants ever end up in one cluster, but are actually closer to another cluster centre. I doubt if it's common, but seems like it could happen. If so, include a final step in the clustering to ensure each variant is clustered with the closest centre.
# - Save the vf.cache to the nvrgtr file, load all options, show graph, etc on load.
#   - Not until I've implemented the enhanced summary stats info; need to know what's useful to save.


# NOTE:
# - I originally had allowed comments in nvrgtr files, but large encoded distance matrices spawned too many random characters that duplicated it.
# - Calculating the distance matrix for a tree of 4173 leaves took around 67 seconds, while loading it's nvrgtr file took 4. The file was 94MB though.


# # # # #  Session file strings  # # # # #
# Note: tags are expected to be capitalized
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
            self.tree.balance_negative_branches()
            self.tree.clear_negative_branches()
            if distance_matrix is not None:
                self.leaves = self.tree.get_named_leaves()
                if type(distance_matrix) != type(np.zeros(1)):
                    raise NavargatorValueError("Error: cannot initiate VariantFinder with the given 'distance_matrix' as it is the incorrect object type")
                elif distance_matrix.shape != (len(self.leaves), len(self.leaves)):
                    raise NavargatorValueError("Error: cannot initiate VariantFinder with the given 'distance_matrix' as its shape '{}' is incompatible with the  given tree of length {}".format(distance_matrix.shape, len(self.leaves)))
                self.orig_dists = distance_matrix
            else:
                self.leaves, self.orig_dists = self.tree.get_distance_matrix()
            self.ordered_names = self.tree.get_ordered_names()
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
        self._not_ignored_inds = set(range(len(self.leaves)))
        self._max_brute_force_attempts = 1000000 # Under 1 minute for 1 million.
        self._private_display_opts = set(['cluster_background_trans', 'cluster_highlight_trans'])

    # # # # #  Public methods  # # # # #
    def find_variants(self, run_id, method, *args):
        # No longer checking to see if the run has already completed. Moved that to navargator_daemon.py:find_variants()
        #results = self.cache.get(run_id, None)
        #if results != None:  # Already computed
        #    # Needed because the daemon sets self.cache[run_id] = None before this method is called.
        #    return self.cache[run_id]['variants'], self.cache[run_id]['scores'], self.cache[run_id]['alt_variants']
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
                variants, scores, alt_variants = self._brute_force_clustering(num_variants, tolerance)
            elif method == 'k medoids':
                num_replicates = args[2]
                if self.verbose:
                    print('Choosing variants using k medoids...')
                fxn, args = self._cluster_k_medoids, (num_variants, tolerance)
                variants, scores, alt_variants = self._heuristic_rand_starts(fxn, args, num_replicates)
            elif method == 'k minibatch':
                num_replicates, batch_size = args[2:]
                if self.verbose:
                    print('Choosing variants using k minibatch...')
                fxn, args = self._cluster_k_medoids_minibatch, (num_variants, tolerance, batch_size)
                variants, scores, alt_variants = self._heuristic_rand_starts(fxn, args, num_replicates)
            if self.verbose:
                self._print_clustering_results(num_variants, variants, scores, alt_variants)
        elif method in self.threshold_cluster_methods:
            threshold, thresh_percent = args[:2]
            params = (threshold, thresh_percent)
            reduced, min_to_cluster = self._reduce_distances(threshold, thresh_percent)
            if len(reduced) == 0:
                num_orphans, total_clusterable = min_to_cluster, float(len(self._not_ignored_inds))
                percent_feasible = (total_clusterable - num_orphans) / total_clusterable * 100.0
                error_msg = 'Error: infeasible parameters (only {:.2f}% could be clustered within the given threhsold). To fix this, raise the critical threshold, lower the critical percent, or add more available variants.'.format(percent_feasible)
                variants, scores, alt_variants = [], error_msg, []
            elif method == 'qt minimal':
                variants, scores, alt_variants = self._qt_radius_clustering_minimal(threshold, min_to_cluster, reduced)
            elif method == 'qt greedy':
                variants, scores, alt_variants = self._qt_radius_clustering_greedy(threshold, min_to_cluster, reduced)
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
        """Truncates the names of the leaf nodes. This is a VariantFinder-specific change, as the self.tree object will alway contain the full node names."""
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
        vf.leaves = self.leaves[::]
        vf.index = self.index.copy()
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
    def _brute_force_clustering(self, num_variants, tolerance):
        avail_medoid_indices = sorted(self.index[n] for n in self.available)
        chsn_tup = tuple(self.index[n] for n in self.chosen)
        dists = self._transform_distances(tolerance)
        best_med_inds, best_scores, best_score, best_clusters = None, None, float('inf'), None
        alt_variants = []
        for avail_inds in itertools.combinations(avail_medoid_indices, num_variants-len(chsn_tup)):
            med_inds = avail_inds + chsn_tup
            clusters = self._partition_nearest(med_inds, dists)
            scores = self._sum_dist_scores(med_inds, clusters, dists)
            score = sum(scores)
            if score == best_score:
                alt_variants.append(med_inds)
            elif score < best_score:
                best_med_inds, best_scores, best_score, best_clusters = med_inds, scores, score, clusters
                alt_variants = []
        if best_med_inds == None:
            error_msg = 'Error: big problem in brute force clustering, no comparisons were made.'
            return [], error_msg, []
        final_scores = self._sum_dist_scores(best_med_inds, best_clusters, self.orig_dists) # Untransformed distances
        return best_med_inds, final_scores, alt_variants
    def _heuristic_rand_starts(self, fxn, args, num_replicates):
        # Run num_replicates times and find the best score
        optima = {}
        for i in range(num_replicates):
            variants, scores = fxn(*args)
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
    def _cluster_k_medoids(self, num_variants, tolerance):
        avail_medoid_indices = [self.index[name] for name in self.tree.get_ordered_names() if name in self.available]
        chsn_indices = list(self.index[n] for n in self.chosen)
        num_chsn = len(chsn_indices)
        dists = self._transform_distances(tolerance)
        # This spaces the initial centroids around the tree
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
        improvement = True
        while improvement == True:
            improvement = False
            med_inds = best_med_inds.copy()
            for i in range(num_chsn, num_variants):
                for ind in avail_medoid_indices:
                    if ind in med_inds: continue
                    med_inds[i] = ind
                    clusters = self._partition_nearest(med_inds, dists)
                    scores = self._sum_dist_scores(med_inds, clusters, dists)
                    score = sum(scores)
                    if score < best_score:
                        best_scores, best_score = scores, score
                        best_med_inds[i] = ind
                        improvement = True
                    else:
                        med_inds[i] = best_med_inds[i]
        return best_med_inds, best_scores
    def _cluster_k_medoids_minibatch(self, num_variants, tolerance, batch_size):
        """Runs a k-medoids clustering approach, but only on a random subsample of the available variants. Yields massive time savings, with only a minor performance hit (often none)."""
        avail_medoid_indices = [self.index[name] for name in self.tree.get_ordered_names() if name in self.available]
        chsn_indices = [self.index[n] for n in self.chosen]
        num_chsn = len(chsn_indices)
        dists = self._transform_distances(tolerance)
        # This spaces the initial centroids around the tree
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
                    clusters = self._partition_nearest(med_inds, dists)
                    scores = self._sum_dist_scores(med_inds, clusters, dists)
                    score = sum(scores)
                    if score < best_score:
                        best_scores, best_score = scores, score
                        best_med_inds[i] = ind
                        improvement = True
                    else:
                        med_inds[i] = best_med_inds[i]
        return best_med_inds, best_scores

    def _qt_radius_clustering_greedy(self, threshold, min_to_cluster, reduced):
        """This implementation is a little different than a typical one, because of the available & unassigned variants. In a normal implementation, every variant is always guaranteed to be able to be placed into a cluster, to form a singleton if nothing else. But there may be no available variant within threshold distance of some unassigned variant. Or worse, the nearest available variant may be assigned to some other cluster, stranding some unassigned variants. This one is greedy.
        Use constraint propagation with branch/bound; once we find a valid solution, any configuration that yields the same number/more clusters can be pruned. Don't think I can use the total score to prune, but I can prune if too many unassigned are stranded (more than the allowed miss %). Might want to use greedy to find a quick first solution, then iterate over the smallest clusters first in the CP algorithm. We want a fast decent solution for the branch/bound part, but for CP you want to fail fast to cut out solution space. Try it both ways.
        Still don't know if it's a good idea to inf out both rows and columns of variants being considered as assigned to some centre; maybe count them as clustered, but still allow them to be available?"""
        centre_inds, clustered_inds = [], set()
        chsn_indices = [self.index[name] for name in self.chosen]
        for chsn_ind in chsn_indices:
            cluster_inds = np.nonzero(reduced[:,chsn_ind] == 0)[0]
            centre_inds.append(chsn_ind)
            clustered_inds.update(cluster_inds)
            # Remove chosen and their clusters from all consideration
            reduced[:,cluster_inds] = np.inf
            reduced[cluster_inds,:] = np.inf
        # Iteratively find the largest cluster, until enough variants are clustered
        while len(clustered_inds) < min_to_cluster:
            centre_ind, cluster_inds = self._find_largest_candidate(reduced)
            if centre_ind == None:
                percent_placed = len(clustered_inds)*100.0/float(len(self._not_ignored_inds))
                error_msg = 'Error: clustering finished prematurely ({:.2f}% placed). To fix this, raise the critical threshold, lower the critical percent, or add more available variants.'.format(percent_placed)
                return [], error_msg, [centre_inds, self._not_ignored_inds-clustered_inds]
            centre_inds.append(centre_ind)
            clustered_inds.update(cluster_inds)
            reduced[:,cluster_inds] = np.inf  # Also removes centre_ind
            reduced[cluster_inds,:] = np.inf  # from consideration
        final_cluster_inds = self._partition_nearest(centre_inds, self.orig_dists)
        final_scores = self._sum_dist_scores(centre_inds, final_cluster_inds, self.orig_dists)
        alt_variants = []
        return centre_inds, final_scores, alt_variants

    def _find_largest_candidate(self, reduced):
        """Identifies the index of the variant with the most close neighbours. Assumes all distances below the threshold of interest have already been set to 0. Returns the index of the cluster centre, and an array of indices representing the variants in that cluster (including the cluster centre)."""
        nbr_counts = np.count_nonzero(reduced == 0, axis=0) # = [1, 1, 4, 2,...] where each value is the number of neighbours for the variant at that index.
        count_max = nbr_counts.max()
        if count_max == 0:  # Indicates there are no available variants close enough
            return None, [] # to the remaining unassigned. Usually results in an error.
        max_inds = np.nonzero(nbr_counts == count_max)[0] # Array containing the indices of all variants with the max number of neighbours.
        if len(max_inds) == 1: # A single largest cluster
            best_center = max_inds[0]
            best_clstr = np.nonzero(reduced[:,best_center] == 0)[0]
        else: # A tie for largest cluster. Broken by smallest sum of full scores
            best_center, best_clstr, best_score = None, [], np.inf

            # THIS SHOULD be vectorized. don't use a For.
            for max_ind in max_inds:
                clstr_inds = np.nonzero(reduced[:,max_ind] == 0)[0]
                score = np.sum(self.orig_dists[clstr_inds,max_ind])
                if score < best_score:
                    best_center, best_clstr, best_score = max_ind, clstr_inds, score
        return best_center, best_clstr

    def _qt_radius_clustering_minimal(self, threshold, min_to_cluster, reduced):
        """This implementation is a little different than a typical one, because of the available & unassigned variants. In a normal implementation, every variant is always guaranteed to be able to be placed into a cluster, to form a singleton if nothing else. But there may be no available variant within threshold distance of some unassigned variant. Or worse, the nearest available variant may be assigned to some other cluster, stranding some unassigned variants. This one is greedy.
        Use constraint propagation with branch/bound; once we find a valid solution, any configuration that yields the same number/more clusters can be pruned. Don't think I can use the total score to prune, but I can prune if too many unassigned are stranded (more than the allowed miss %). Might want to use greedy to find a quick first solution, then iterate over the smallest clusters first in the CP algorithm. We want a fast decent solution for the branch/bound part, but for CP you want to fail fast to cut out solution space. Try it both ways.
        Still don't know if it's a good idea to inf out both rows and columns of variants being considered as assigned to some centre; maybe count them as clustered, but still allow them to be available?
        This implementation uses the "reduced" distance matrix for initialization, but not during the algorithm. It will, however, be modified during execution of the greedy implementation which is used as an initial solution. """
        # 0.2 @ 98% takes 59 sec for minimal, fraction of a sec for greedy

        chsn_indices = [self.index[name] for name in self.chosen]
        avail_indices = [self.index[name] for name in self.available]
        nbr_counts = np.count_nonzero(reduced == 0, axis=0) # = [1, 1, 4, 2,...] where each value is the number of neighbours for the variant at that index (columns summed).

        neighbors_of = {}
        for ind in chsn_indices + avail_indices:
            clstr_inds = np.nonzero(reduced[:,ind] == 0)[0]
            neighbors_of[ind] = set(clstr_inds)
        covered_inds = Counter()
        for ind in chsn_indices:
            covered_inds.add(neighbors_of[ind])
        # Get initial solution, use it to constrain the brute force search
        greedy_centre_inds, greedy_scores, alt_info = self._qt_radius_clustering_greedy(threshold, min_to_cluster, reduced.copy())

        if len(greedy_centre_inds) == 0:
            # Indicates the greedy solver didn't complete, but there is a guaranteed feasible solution.
            # Fills out greedy_centre_inds with a quick greedy feasible solution
            greedy_centre_inds, greedy_orphans = alt_info
            greedy_orphans = np.array(list(greedy_orphans))
            num_allowed_orphans = len(self._not_ignored_inds) - min_to_cluster
            while len(greedy_orphans) > num_allowed_orphans:
                orphans_in_range = np.count_nonzero(reduced[greedy_orphans,:] == 0, axis=0)
                avail_ind = np.argmax(orphans_in_range)
                still_orphans = reduced[greedy_orphans,avail_ind] != 0
                greedy_orphans = greedy_orphans[still_orphans]
                greedy_centre_inds.append(avail_ind)
            greedy_cluster_inds = self._partition_nearest(greedy_centre_inds, self.orig_dists)
            greedy_score = sum(self._sum_dist_scores(greedy_centre_inds, greedy_cluster_inds, self.orig_dists))
        else:
            greedy_score = sum(greedy_scores)

        avail_order = np.argsort(nbr_counts)[::-1] # = variant indices in decreasing order of initial cluster size
        # np.argsort(nbr_counts)[::-1] cut tbpb59/0.2/98% from 60 to 30 sec
        avail_order = [ind for ind in avail_order if ind in avail_indices and ind not in greedy_centre_inds]
        avail_order = greedy_centre_inds + avail_order

        print 'greedy', greedy_centre_inds, greedy_score
        score, centre_inds = self._recursive_qt_cluster(0, [], covered_inds, greedy_score, greedy_centre_inds, neighbors_of, min_to_cluster, avail_order)
        print 'final', centre_inds, score

        final_cluster_inds = self._partition_nearest(centre_inds, self.orig_dists)
        final_scores = self._sum_dist_scores(centre_inds, final_cluster_inds, self.orig_dists)
        alt_variants = []
        return centre_inds, final_scores, alt_variants

    def _recursive_qt_cluster(self, order_ind, centre_inds, covered_inds, best_score, best_centre_inds, neighbors_of, min_to_cluster, avail_order):

        # include a check to see if there are enough possible avail variants remaning to satisfy min_to_cluster. Is that even possible?
        # can I use a np matrix somehow? keep track of which avail cover which variants?
        # what about bottom-up. what if each variant knows the avail within thresh, and the decision variables (1 per non-ignored) indicate which group it belongs to?

        if order_ind >= len(avail_order):
            # Index out of bounds
            return best_score, best_centre_inds
        elif len(centre_inds) >= len(best_centre_inds):
            # Already have a guaranteed better solution. Not ">", as the new centre hasn't been added yet
            return best_score, best_centre_inds

        cur_ind = avail_order[order_ind]

        # First assume we include this ind
        centre_inds.append(cur_ind)
        covered_inds.add(neighbors_of[cur_ind])

        if len(covered_inds) >= min_to_cluster: # So it's a valid configuration
            cluster_inds = self._partition_nearest(centre_inds, self.orig_dists)
            score = sum(self._sum_dist_scores(centre_inds, cluster_inds, self.orig_dists))
            if score < best_score:
                print '  =================  ', best_score, score
                best_score, best_centre_inds = score, centre_inds[::]
        best_score, best_centre_inds = self._recursive_qt_cluster(order_ind+1, centre_inds, covered_inds, best_score, best_centre_inds, neighbors_of, min_to_cluster, avail_order)

        # Then assume ind is excluded
        centre_inds.remove(cur_ind)
        covered_inds.remove(neighbors_of[cur_ind])
        best_score, best_centre_inds = self._recursive_qt_cluster(order_ind+1, centre_inds, covered_inds, best_score, best_centre_inds, neighbors_of, min_to_cluster, avail_order)

        # Is it a good idea to add ind, run, remove ind, run. Should I assume not to include it first?

        return best_score, best_centre_inds

    def _reduce_distances(self, threshold, thresh_percent):
        """Does not remove chosen. If the given thresholds are infeasible, returns ([], num_orphans) to indicate an error."""
        reduced = self.orig_dists.copy()
        reduced[reduced <= threshold] = 0
        chsn_indices = [self.index[name] for name in self.chosen]
        ignrd_indices = [self.index[name] for name in self.ignored]
        avail_indices = [self.index[name] for name in self.available]
        unassigned_indices = list(self._not_ignored_inds - set(avail_indices) - set(chsn_indices))
        # Remove ignored from all consideration
        if ignrd_indices:
            reduced[:,ignrd_indices] = np.inf
            reduced[ignrd_indices,:] = np.inf
        # Remove unassigned from centre consideration
        if unassigned_indices:
            reduced[:,unassigned_indices] = np.inf
        # Check if the given parameters are feasible
        min_to_cluster = ceil(thresh_percent/100.0 * len(self._not_ignored_inds))
        avail_in_range = np.count_nonzero(reduced[unassigned_indices,:] == 0, axis=1)
        unassigned_orphans = np.sum(avail_in_range == 0)
        if unassigned_orphans > (len(self._not_ignored_inds) - min_to_cluster):
            # Too many unassigned further than threshold distance from the closest available
            return [], unassigned_orphans
        return reduced, min_to_cluster

    def _transform_distances(self, tolerance):
        """A parameter used to make the k-based clustering methods less sensitive to outliers. When tolerance=1 it has no effect; when tolerance>1 clusters are more accepting of large branches, and cluster sizes tend to be more similar; when tolerance<1 clusters are less accepting of large branches, and cluster sizes tend to vary more. The transformed distances are then normalized to the max value of the untransformed distances."""
        try:
            tolerance = float(tolerance)
        except:
            raise NavargatorValueError('Error: tolerance must be a number.')
        if tolerance <= 0.0:
            raise NavargatorValueError('Error: tolerance must be a strictly positive number.')
        elif tolerance == 1.0:
            return self.orig_dists.copy()
        dists = np.power(self.orig_dists.copy()*tolerance + 1.0, 1.0/tolerance) - 1.0
        return dists
    def _partition_nearest(self, medoids, dists):
        """Given an array of indices, returns a list of lists, where the ith sublist contains the indices of the nodes closest to the ith medoid in inds."""
        closest_medoid_ind = np.argmin(dists[:,medoids], 1) # If len(inds)==3, would look like [2,1,1,0,1,2,...].
        clusts = [[] for i in medoids]
        for node_ind, med_ind in enumerate(closest_medoid_ind):
            if node_ind in self._not_ignored_inds:
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
        print 'run time', self.cache[run_id]['method'], run_length
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
        new_ingroup_inds = set(range(len(self.leaves)))
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


class Counter(object):
    """Object used to monitor variants covered by some centre during clustering. If 2 possible centres both cover some variant, and then 1 centre is removed from consideration, this data structure will indicate that the variant is still being covered."""
    def __init__(self):
        self._dict = {}
        self._len = 0
    def get_all(self):
        return set(self._dict.keys())
    def add(self, to_add):
        for ele in to_add:
            if ele in self._dict:
                self._dict[ele] += 1
            else:
                self._dict[ele] = 1
                self._len += 1
    def remove(self, to_rem):
        for ele in to_rem:
            if ele not in self._dict:
                continue
            elif self._dict[ele] == 1:
                del self._dict[ele]
                self._len -= 1
            else:
                self._dict[ele] -= 1
    def __len__(self):
        return self._len
    def __contains__(self, ele):
        return ele in self._dict
    def __sub__(self, other):
        return set(self._dict.keys()) - other
    def __rsub__(self, other):
        return other - set(self._dict.keys())
