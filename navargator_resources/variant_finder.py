"""
Defines the following public functions:
  load_navargator_file(file_path)
"""
import os, sys, itertools, random, time
from math import log, exp
from copy import deepcopy
import numpy as np
from navargator_resources import phylo
from navargator_resources.navargator_common import NavargatorValidationError, NavargatorValueError, NavargatorRuntimeError

if sys.version_info >= (3,0):
    basestring = str
def to_string(string, py3=sys.version_info >= (3,0)):
    if py3:
        return str(string, 'utf-8')
    else:
        return string

# TODO:
# - Finish writing process_tag_data() to process display options.
# - Implement spectral clustering. Would be the quickest method, and especially useful for large data sets.
# - Implement threshold clustering.

# # # # #  Session file strings  # # # # #
comment_prefix = '//'
tag_affixes = ('[(', ')]')
chosen_nodes_tag = 'Chosen variants'
available_nodes_tag = 'Available variants'
ignore_nodes_tag = 'Ignored variants'
display_options_tag = 'Display options - ' # The option category string is appended to this.
tree_data_tag = 'Newick tree'

# # # # #  Misc functions  # # # # #
def load_navargator_file(file_path, verbose=True):
    if not file_path.lower().endswith('.nvrgtr'):
        file_path += '.nvrgtr'
    if not os.path.isfile(file_path):
        raise NavargatorValueError('Error: could not find the given navargator file "{}"'.format(file_path))
    if verbose:
        print('Loading information from %s...' % file_path)
    with open(file_path, 'rb') as f:
        vfinder = navargator_from_data(f, verbose=verbose)
    return vfinder
def navargator_from_data(data_lines, verbose=False):
    """Expects data as an iterable of lines. Should be either a file object or a str.splitlines()."""
    data = {}
    def process_tag_data(tag, data_buff):
        tag = tag.capitalize()
        if tag in data:
            raise NavargatorValidationError('Error: the given NaVARgator session file has multiple sections labeled "[({})]".'.format(tag))
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
                cat_dict[opt.strip()] = val.strip()
        elif tag == tree_data_tag: # These data are stored as a single string
            data[tag] = data_buff[0]
        else:
            data[tag] = data_buff
    # End of process_tag_data()
    tag, data_buff = '', []
    for line in data_lines:
        line = to_string(line.strip())
        if not line or line.startswith(comment_prefix): continue
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

    display_options = data.get(display_options_tag, {})
    vfinder = VariantFinder(tree_data, tree_format='newick', display_options=display_options, verbose=verbose)
    chsn, avail, ignor = data.get(chosen_nodes_tag), data.get(available_nodes_tag), data.get(ignore_nodes_tag)
    if chsn:
        vfinder.chosen = chsn
    if avail:
        vfinder.available = avail
    if ignor:
        vfinder.ignored = ignor
    return vfinder
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
    def __init__(self, tree_input, tree_format='auto', display_options=None, verbose=True, _blank_init=False):
        self.verbose = bool(verbose)
        self.leaves = []
        self.cache = {}
        self.normalize = self._empty_normalize()
        if display_options:
            self.display_options = display_options
        else:
            self.display_options = {}
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
            self.leaves, self.orig_dist = self.tree.get_distance_matrix()
            self.index = {name:index for index, name in enumerate(self.leaves)}
            self.dist = self.orig_dist.copy()
            max_name_length = self.display_options.setdefault('sizes', {}).get('max_variant_name_length', None)
            if max_name_length == None:
                max_name_length = str(max(len(name) for name in self.leaves))
                self.display_options['sizes']['max_variant_name_length'] = max_name_length
            self.newick_tree_data = self.tree.newick_string(support_as_comment=False, support_values=False, comments=False, internal_names=False, max_name_length=int(max_name_length))
            self.phyloxml_tree_data = self.tree.phyloxml_string(support_values=False, comments=False, internal_names=False, max_name_length=int(max_name_length))
        self._ignored = set() # Accessible as self.ignored
        self._available = set(self.leaves) # Accessible as self.available
        self._chosen = set() # Accessible as self.chosen
        self._distance_scale = 1.0 # Accessible as self.distance_scale
        # # #  Private attributes # # #
        self._not_ignored_inds = set(range(len(self.leaves)))
        self._cluster_methods = set(['k medoids', 'brute force'])
        self._distance_scale_max = 1000
        self._max_brute_force_attempts = 1000000 # Under 1 minute for 1 million.
        self._private_display_opts = set(['cluster_background_trans', 'cluster_highlight_trans'])

    # # # # #  Public methods  # # # # #
    def find_variants(self, num_variants, distance_scale=None, method=None, bootstraps=10):
        num_avail, num_chsn = len(self.available), len(self.chosen)
        if not num_chsn <= num_variants <= num_avail + num_chsn:
            raise NavargatorValueError('Error finding variants: num_variants must be an integer greater than the number of chosen nodes (currently: {}) but less than or equal to the number of available + chosen nodes (currently: {}).'.format(num_chsn, num_avail + num_chsn))
        if distance_scale != None:
            self.distance_scale = distance_scale
        num_possible_combinations = binomial_coefficient(num_avail, num_variants-num_chsn)
        if self.verbose:
            print('\nThere are %s possible combinations of variants.' % format_integer(num_possible_combinations))
            init_time = time.time()
        method = self._validate_clustering_method(method, num_possible_combinations)
        params = (num_variants, self.distance_scale)
        if self.cache.get(params, None):
            # Needed because the daemon sets self.cache[params] = None before this method is called.
            variants, scores, alt_variants = self.cache[params]['variants'], self.cache[params]['scores'], self.cache[params]['alt_variants']
        elif num_variants == num_avail + num_chsn:
            variants = [self.index[name] for name in list(self.available)+list(self.chosen)]
            scores = [0.0 for n in range(num_avail + num_chsn)]
            alt_variants = []
        elif method == 'brute force':
            if self.verbose:
                expected_runtime = int(round(num_possible_combinations * 0.000042, 0))
                print('Finding optimal variants using brute force. This should take ~%i seconds...' % expected_runtime)
            variants, scores, alt_variants = self._brute_force_clustering(num_variants)
        elif method == 'k medoids':
            if self.verbose:
                print('Choosing variants using k medoids...')
            fxn, args = self._cluster_k_medoids, (num_variants,)
            variants, scores, alt_variants = self._heuristic_rand_starts(fxn, args, bootstraps)
        else:
            raise NavargatorValueError('Error: clustering method "{}" is not recognized'.format(method))
        if self.verbose:
            self._print_clustering_results(num_variants, init_time, variants, scores, alt_variants)
        self._calculate_cache_values(params, variants, scores, alt_variants)
        return variants, scores, alt_variants

    def root_midpoint(self):
        self.tree.root_midpoint()
        self.newick_tree_data = self.tree.newick_string(support_as_comment=False, support_values=False, comments=False, internal_names=False)
        self.phyloxml_tree_data = self.tree.phyloxml_string(support_values=False, comments=False, internal_names=False)
        if self.verbose:
            print('\nRe-rooted the tree to its midpoint')

    def root_outgroup(self, outgroup_names):
        self.tree.root_outgroup(outgroup_names, distance=0.5, distance_proportion=True)
        self.newick_tree_data = self.tree.newick_string(support_as_comment=False, support_values=False, comments=False, internal_names=False)
        self.phyloxml_tree_data = self.tree.phyloxml_string(support_values=False, comments=False, internal_names=False)
        if self.verbose:
            print('\nRe-rooted the tree to the given outgroup')

    def reorder_tree_nodes(self, increasing):
        self.tree.reorder_children(increasing=increasing)
        self.newick_tree_data = self.tree.newick_string(support_as_comment=False, support_values=False, comments=False, internal_names=False)
        self.phyloxml_tree_data = self.tree.phyloxml_string(support_values=False, comments=False, internal_names=False)
        if self.verbose:
            print('\nRe-ordered the tree nodes')

    def truncate_names(self, truncate_length):
        # Don't set either attribute until both of the calls return error-free:
        newick_tree_data = self.tree.newick_string(support_as_comment=False, support_values=False, comments=False, internal_names=False, max_name_length=truncate_length)
        phyloxml_tree_data = self.tree.phyloxml_string(support_values=False, comments=False, internal_names=False, max_name_length=truncate_length)
        self.newick_tree_data = newick_tree_data
        self.phyloxml_tree_data = phyloxml_tree_data
        # Update leaf names in relevant variables:
        new_leaves = [name[:truncate_length] for name in self.tree.get_named_leaves()]
        trans = dict((old_name, new_name) for old_name,new_name in zip(self.leaves, new_leaves))
        self.index = {name:index for index, name in enumerate(new_leaves)}
        self._available = set(trans[name] for name in self.available)
        self._chosen = set(trans[name] for name in self.chosen)
        self._ignored = set(trans[name] for name in self.ignored)
        self.leaves = new_leaves
        # Don't have to modify self._not_ignored_inds as the order of self.leaves hasn't changed.
        # Re-generate the cache; names have changed, but cluster patterns and scores haven't:
        old_cache = self.cache
        self.cache = {}
        for params, info in old_cache.items():
            variant_inds = np.array([self.leaves.index(trans[name]) for name in info['variants']])
            scores = info['scores'][::]
            alt_variants = [alt.copy() for alt in info['alt_variants']]
            self._calculate_cache_values(params, variant_inds, scores, alt_variants)
        self.display_options['sizes']['max_variant_name_length'] = truncate_length
        if self.verbose:
            print('\nTruncated the tree names')

    def get_tree_string(self, tree_type):
        if tree_type == 'newick':
            return self.tree.newick_string()
        elif tree_type == 'nexus':
            return self.tree.nexus_string()
        elif tree_type == 'phyloxml':
            return self.tree.phyloxml_string()
        elif tree_type == 'nexml':
            return self.tree.nexml_string()
        else:
            raise NavargatorValueError('Error: tree format "{}" is not recognized'.format(tree_type))

    def save_tree_file(self, file_path, tree_type):
        tree_str = self.get_tree_string(tree_type)
        with open(file_path, 'w') as f:
            f.write(tree_str)
        if self.verbose:
            print('\nTree saved to %s' % file_path)

    def save_navargator_file(self, file_path):
        if not file_path.lower().endswith('.nvrgtr'):
            file_path += '.nvrgtr'
        nvrgtr_str = self.get_navargator_string()
        with open(file_path, 'w') as f:
            f.write(nvrgtr_str)
        if self.verbose:
            print('\nData saved to %s' % file_path)

    def get_navargator_string(self):
        tag_format_str = '{}{{:s}}{}\n{{:s}}'.format(*tag_affixes)
        buff = []
        if self.ignored:
            ignor_names = ', '.join(sorted(self.ignored))
            buff.append(tag_format_str.format(ignore_nodes_tag, ignor_names))
        if self.chosen:
            chsn_names = ', '.join(sorted(self.chosen))
            buff.append(tag_format_str.format(chosen_nodes_tag, chsn_names))
        if len(self.available) != len(self._not_ignored_inds):
            avail_names = ', '.join(sorted(self.available))
            buff.append(tag_format_str.format(available_nodes_tag, avail_names))
        # Write display options
        if self.display_options:
            for category in ('fonts', 'sizes', 'colours'):
                if category not in self.display_options:
                    continue
                cat_buff = []
                for key in sorted(self.display_options[category].keys()):
                    if key in self._private_display_opts:
                        continue
                    cat_buff.append('{:s}: {:s}'.format(key, str(self.display_options[category][key])))
                if cat_buff:
                    cat_tag = display_options_tag + category
                    cat_opts = '\n'.join(cat_buff)
                    buff.append(tag_format_str.format(cat_tag, cat_opts))
        # Write tree data
        buff.append(tag_format_str.format(tree_data_tag, self.newick_tree_data))
        # TODO: Write distance matrix
        return '\n\n'.join(buff)

    def copy(self):
        """Returns a deep copy of self"""
        # dict.copy() works if all values are immutable, deepcopy(dict) otherwise.
        vf = VariantFinder(tree_input='', verbose=self.verbose, _blank_init=True)
        vf.tree = self.tree.copy()
        vf.leaves = self.leaves[::]
        vf.index = self.index.copy()
        vf.orig_dist = self.orig_dist.copy()
        vf.dist = self.dist.copy()
        vf.newick_tree_data = self.newick_tree_data
        vf.phyloxml_tree_data = self.phyloxml_tree_data
        vf.cache = deepcopy(self.cache)
        vf.normalize = deepcopy(self.normalize)
        vf.display_options = deepcopy(self.display_options)
        vf._not_ignored_inds = self._not_ignored_inds.copy()
        vf._ignored = self.ignored.copy()
        vf._chosen = self.chosen.copy()
        vf._available = self.available.copy()
        vf._distance_scale = self.distance_scale
        return vf

    # # # # #  Clustering methods  # # # # #
    def _heuristic_rand_starts(self, fxn, args, bootstraps):
        optima = {}
        for i in range(bootstraps):
            variants, scores = fxn(*args)
            var_tup = tuple(sorted(variants))
            if var_tup in optima:
                optima[var_tup]['count'] += 1
            else:
                optima[var_tup] = {'count':1, 'score':sum(scores), 'variants':variants, 'scores':scores}
        ranked_vars = sorted(optima.keys(), key=lambda opt: optima[opt]['score'])
        best_variants, best_scores = optima[ranked_vars[0]]['variants'], optima[ranked_vars[0]]['scores']
        alt_optima, alt_variants, opt_count = 0, [], optima[ranked_vars[0]]['count']
        if bootstraps > 1:
            for rv in ranked_vars[1:]:
                if optima[rv]['score'] == sum(best_scores):
                    alt_optima += 1
                    alt_variants.append(optima[rv]['variants'])
                    opt_count += optima[rv]['count']
                else:
                    break
            if self.verbose:
                self._print_alt_variant_results(bootstraps, optima, ranked_vars, alt_optima, opt_count)
        return best_variants, best_scores, alt_variants
    def _brute_force_clustering(self, num_variants):
        avail_medoid_indices = sorted(self.index[n] for n in self.available)
        chsn_tup = tuple(self.index[n] for n in self.chosen)
        best_med_inds, best_scores, best_score = None, None, float('inf')
        alt_variants = []
        for avail_inds in itertools.combinations(avail_medoid_indices, num_variants-len(chsn_tup)):
            med_inds = avail_inds + chsn_tup
            clusters = self._partition_nearest(med_inds)
            scores = self._sum_dist_scores(med_inds, clusters)
            score = sum(scores)
            if score == best_score:
                alt_variants.append(med_inds)
            elif score < best_score:
                best_med_inds, best_scores, best_score = med_inds, scores, score
                alt_variants = []
        if best_med_inds == None:
            raise NavargatorRuntimeError('Error: big problem in brute force clustering, no comparisons were made.')
        return best_med_inds, best_scores, alt_variants
    def _cluster_k_medoids(self, num_variants):
        avail_medoid_indices = sorted(self.index[n] for n in self.available)
        chsn_indices = list(self.index[n] for n in self.chosen)
        num_chsn = len(chsn_indices)
        best_med_inds = np.array(chsn_indices + random.sample(avail_medoid_indices, num_variants-num_chsn))
        best_clusters = self._partition_nearest(best_med_inds)
        best_scores = self._sum_dist_scores(best_med_inds, best_clusters)
        best_score = sum(best_scores)
        # Using a simple greedy algorithm:
        improvement = True
        while improvement == True:
            improvement = False
            med_inds = best_med_inds.copy()
            for i in range(num_chsn, num_variants):
                for ind in avail_medoid_indices:
                    if ind in med_inds: continue
                    med_inds[i] = ind
                    clusters = self._partition_nearest(med_inds)
                    scores = self._sum_dist_scores(med_inds, clusters)
                    score = sum(scores)
                    if score < best_score:
                        best_med_inds, best_scores, best_score = med_inds.copy(), scores, score
                        # just alter the 1 number in best_inds, instead of copy
                        improvement = True
                    else:
                        med_inds[i] = best_med_inds[i]
        return best_med_inds, best_scores

    def _partition_nearest(self, medoids):
        """Given an array of indices, returns a list of lists, where the ith sublist contains the indices of the nodes closest to the ith medoid in inds."""
        # TODO: This should probably look for ties (or where the difference is below some threshold).
        closest_medoid_ind = np.argmin(self.dist[:,medoids], 1) # If len(inds)==3, would look like [2,1,1,0,1,2,...].
        clusts = [[] for i in medoids]
        for node_ind, med_ind in enumerate(closest_medoid_ind):
            if node_ind in self._not_ignored_inds:
                clusts[med_ind].append(node_ind)
        return clusts
    def _sum_dist_scores(self, medoids, clusters):
        return [sum(self.dist[med,inds]) for med,inds in zip(medoids,clusters)]

    # # # # #  Private methods  # # # # #
    def _clear_cache(self):
        self.cache = {}
        self.normalize = self._empty_normalize()
    def _empty_normalize(self):
        """'method' can be one of 'self', 'global', or 'custom'. 'custom_max_count' is X.
        """
        return {'method':'self', 'custom_value':None, 'custom_max_count':0, 'global_value':None, 'global_max_count':0, 'global_nums':set(), 'global_bins':[]}
    def _calculate_cache_values(self, params, variant_inds, scores, alt_variants):
        """Fills out the self.cache entry for the given clustering run. 'params'=(number_variants, distance_scale); 'variant_inds'=np.array(variant_indices_1); 'scores'=[clust_1_score, clust_2_score,...]; 'alt_variants'=[np.array(variant_indices_2), np.array(variant_indices_3),...]"""
        cluster_inds = self._partition_nearest(variant_inds)
        variants = [self.leaves[i] for i in variant_inds]
        clusters = [[self.leaves[i] for i in clst] for clst in cluster_inds]
        variant_distance, max_var_dist = {}, 0
        for rep_ind, clst_inds in zip(variant_inds, cluster_inds):
            for var_ind in clst_inds:
                dist = self.dist[rep_ind, var_ind]
                variant_distance[self.leaves[var_ind]] = dist
                if dist > max_var_dist:
                    max_var_dist = dist
        self.cache[params] = {'variants':variants, 'scores':scores, 'clusters':clusters, 'variant_distance':variant_distance, 'max_distance':max_var_dist, 'alt_variants':alt_variants}
    def _print_clustering_results(self, num_variants, init_time, variants, scores, alt_variants):
        run_time = time.time() - init_time
        if alt_variants:
            print('Found %i equal sets of %i representative variants in %.1f seconds.' % (len(alt_variants)+1, num_variants, run_time))
            alt_var_buff = []
            for avars in alt_variants:
                alt_var_buff.append( 'Alternate variants: %s' % ', '.join(sorted(self.leaves[var_ind] for var_ind in avars)) )
            print('\n%s' % ('\n'.join(alt_var_buff)))
        else:
            print('Found %i representative variants in %.1f seconds.' % (num_variants, run_time))
        variant_names = ', '.join(sorted(self.leaves[v] for v in variants))
        print('\nBest score: %f\nBest variants: %s' % (sum(scores), variant_names))
    def _print_alt_variant_results(self, bootstraps, optima, ranked_vars, alt_optima, opt_count):
        optima_percent = round(opt_count * 100.0 / bootstraps, 0)
        if len(ranked_vars) == 1:
            print('One unique solution found after %i bootstraps.' % (bootstraps))
        elif alt_optima == 0:
            imprv_percent = round((optima[ranked_vars[1]]['score'] - optima[ranked_vars[0]]['score']) * 100.0 / optima[ranked_vars[0]]['score'], 1)
            print('%i solutions found after %i bootstraps; %i%% consensus for the optimum (%.1f%% improvement over solution #2).' % (len(ranked_vars), bootstraps, optima_percent, imprv_percent))
        else:
            print('%i solutions found after %i bootstraps; %i%% consensus for the optimum (from %i equivalent solutions).' % (len(ranked_vars), bootstraps, optima_percent, alt_optima+1))

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
        if isinstance(names, basestring):
            names = [names]
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
        if isinstance(names, basestring):
            names = [names]
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
        if isinstance(names, basestring):
            names = [names]
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
    @property
    def distance_scale(self):
        return self._distance_scale
    @distance_scale.setter
    def distance_scale(self, val):
        try:
            val = float(val)
        except:
            raise NavargatorValueError('Error: distance_scale must be a number.')
        if val <= 0.0:
            raise NavargatorValueError('Error: distance_scale must be a strictly positive number.')
        elif val > self._distance_scale_max:
            raise NavargatorValueError('Error: distance_scale must be less than {}.'.format(self._distance_scale_max))
        self._distance_scale = val
        self.dist = np.power(self.orig_dist.copy()+1.0, val) - 1.0
        # self._clear_cache()


# TODO:
# The sliding scale does not appear to be changing the results, either applied to the dist matrix or to the summed score of a cluster. In theory it is able to, but it might have to be very dramatic to do so.
# Should be a sliding scale for priority: what is best, some strains hit very well but some missed by a lot, or all strains hit decently?
  # I think that if this is changed, there's probably a way to check if the clustering has to be redone or not (the pattern cannot be improved unless the scaling changes a distance by more than x). Prevent too much of the algorithm from being rerun.
  # I think ((d+1.0)**x)-1.0 is probably good, where x is the sliding scale. The +1.0 is necessary because between 0 and 1 sqrt increases the value, while it decreases the values above 1 (which is what I want; also I may have some distances above and some below 1).
    # x=1.0 is regular distances. x<1 makes long distances more acceptable (so getting lots of close hits is prioritized). x>1 makes long distances more costly, so the medeoids will try to cover everything poorly instead of a few things very well.
