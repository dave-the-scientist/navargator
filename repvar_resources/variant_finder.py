"""
Defines the following public functions:
  load_repvar_file(file_path)
"""
import os, itertools, random, time
from math import log, exp
import numpy as np
from tree_parse import TreeParser

# # # # #  Variables  # # # # #
chosen_nodes_tag = 'chosen variants'
available_nodes_tag = 'available variants'
ignore_nodes_tag = 'ignored variants'
tree_data_tag = 'newick tree'

# # # # #  Misc functions  # # # # #
def load_repvar_file(file_path, verbose=True):
    if not file_path.lower().endswith('.repvar'):
        file_path += '.repvar'
    if not os.path.isfile(file_path):
        print('Error: could not find the given repvar file "%s"' % file_path)
        exit()
    if verbose:
        print('Loading information from %s...' % file_path)
    with open(file_path) as f:
        vfinder = repvar_from_data(f, verbose=verbose)
    return vfinder
def repvar_from_data(data_lines, verbose=False):
    """Expects data as an iterable of lines. Should be either a file object or a str.splitlines()."""
    data = {}
    def process_tag_data(tag, data_buff):
        if tag in data:
            print('Error: the repvar file %s has multiple sections labeled "[%s]".' % (file_path, tag))
            exit()
        if not data_buff:
            return
        if tag in (chosen_nodes_tag, available_nodes_tag, ignore_nodes_tag): # These data to be split into lists
            val = ','.join(data_buff)
            val_list = val.split(',')
            data[tag] = val_list
        elif tag == tree_data_tag: # These data are stored as a single string
            data[tag] = data_buff[0]
        else:
            data[tag] = data_buff
    tag, data_buff = '', []
    for line in data_lines:
        line = line.strip()
        if not line or line.startswith('#'): continue
        if line.startswith('[') and line.endswith(']'):
            process_tag_data(tag, data_buff)
            tag, data_buff = line[1:-1], []
        else:
            data_buff.append(line)
    process_tag_data(tag, data_buff)
    # data is now filled out
    vfinder = VariantFinder(data[tree_data_tag], tree_format='newick', verbose=verbose)
    chsn = data.get(chosen_nodes_tag)
    if chsn:
        vfinder.chosen = chsn
    avail = data.get(available_nodes_tag)
    if avail:
        vfinder.available = avail
    ignor = data.get(ignore_nodes_tag)
    if ignor:
        vfinder.ignored = ignor
    return vfinder
def binomial_coefficient(n, k):
    """Quickly computes the binomial coefficient of n-choose-k. This may not be exact due to floating point errors and the log conversions, but is close enough for my purposes."""
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
    def __init__(self, tree_input, tree_format='newick', verbose=True, _blank_init=False):
        self.verbose = bool(verbose)
        self.leaves = []
        self.cache = {}
        if not _blank_init:
            tree = TreeParser(tree_input, tree_format=tree_format, verbose=verbose)
            self.leaves = tree.leaves # List of all terminal leaves in tree_file
            self.index = tree.index # The index of each sequence name in self.leaves
            self.orig_dist = tree.dist.copy()
            self.dist = tree.dist.copy()
            self.tree_data = tree.tree_data
            self.phylo_xml_data = tree.phylo_xml_data
        self._ignored = set() # Accessible as self.ignored
        self._available = set(self.leaves) # Accessible as self.available
        self._chosen = set() # Accessible as self.chosen
        self._distance_scale = 1.0 # Accessible as self.distance_scale
        # # #  Private attributes # # #
        self._not_ignored_inds = set(range(len(self.leaves)))
        self._cluster_methods = set(['k medoids', 'brute force'])
        self._distance_scale_max = 1000
        self._max_brute_force_attempts = 1000000 # Under 1 minute for 1 million.

    # # # # #  Public methods  # # # # #
    def find_variants(self, num_variants, distance_scale=None, method=None, bootstraps=10):
        num_avail, num_chsn = len(self.available), len(self.chosen)
        if not num_chsn <= num_variants <= num_avail + num_chsn:
            print('Error: num_variants must be an integer greater than the number of chosen nodes (currently: %i) but less than or equal to the number of available + chosen nodes (currently: %i).' % (num_chsn, num_avail + num_chsn))
            exit()
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
            variants = sorted(list(self.available) + list(self.chosen))
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
            print('Error: clustering method "%s" is not recognized.' % method)
            exit()
        if self.verbose:
            self._print_clustering_results(num_variants, init_time, variants, scores, alt_variants)
        self.cache[params] = {'variants':variants, 'scores':scores, 'alt_variants':alt_variants}
        return variants, scores, alt_variants

    def save_repvar_file(self, file_path):
        if not file_path.lower().endswith('.repvar'):
            file_path += '.repvar'
        repvar_str = self.get_repvar_string()
        with open(file_path, 'w') as f:
            f.write(repvar_str)
        if self.verbose:
            print('\nData saved to %s' % file_path)

    def get_repvar_string(self):
        buff = []
        if self.ignored:
            ignor_names = ', '.join(sorted(self.ignored))
            buff.append('[%s]\n%s' % (ignore_nodes_tag, ignor_names))
        if self.chosen:
            chsn_names = ', '.join(sorted(self.chosen))
            buff.append('[%s]\n%s' % (chosen_nodes_tag, chsn_names))
        if len(self.available) != len(self._not_ignored_inds):
            avail_names = ', '.join(sorted(self.available))
            buff.append('[%s]\n%s' % (available_nodes_tag, avail_names))
        buff.append('[%s]\n%s' % (tree_data_tag, self.tree_data))
        return '\n\n'.join(buff)

    def copy(self):
        """Returns a deep copy of self"""
        vf = VariantFinder(tree_input='', verbose=self.verbose, _blank_init=True)
        vf.leaves = self.leaves[::]
        vf.index = self.index.copy()
        vf.orig_dist = self.orig_dist.copy()
        vf.dist = self.dist.copy()
        vf.tree_data = self.tree_data
        vf.phylo_xml_data = self.phylo_xml_data
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
            print('Error: big problem in brute force clustering, no comparisons were made.')
            exit()
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
            print('Error: the given clustering method "%s" is not supported (must be one of: %s).' % ( method, ', '.join(sorted(self._cluster_methods)) ))
            exit()
        return method
    def _validate_node_name(self, node):
        node = node.strip()
        if node not in self.index:
            print('Error: could not add "%s" to the ignored set, as it was not found in the tree.' % node)
            exit()
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
                print('Error: cannot set "%s" as both ignored and chosen.' % node)
                exit()
            if node in self.available:
                self._available.remove(node)
            new_chosen.add(node)
        if new_chosen != self._chosen:
            self._chosen = new_chosen
            self.cache = {}
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
                print('Error: cannot set "%s" as both ignored and chosen.' % node)
                exit()
            new_ingroup_inds.remove(self.index[node])
            new_ignored.add(node)
        if new_ignored != self._ignored:
            self._ignored = new_ignored
            self._not_ignored_inds = new_ingroup_inds
            self.cache = {}
    @property
    def available(self):
        return self._available
    @available.setter
    def available(self, names):
        if isinstance(names, basestring):
            names = [names]
        if not names:
            new_avail = set(node for node in self.leaves if node not in self.ignored|self.chosen)
        else:
            new_avail = set()
            for node in names:
                node = self._validate_node_name(node)
                if node not in self.ignored|self.chosen:
                    new_avail.add(node)
        if new_avail != self._available:
            self._available = new_avail
            self.cache = {}
    @property
    def distance_scale(self):
        return self._distance_scale
    @distance_scale.setter
    def distance_scale(self, val):
        try:
            val = float(val)
        except:
            print('Error: distance_scale must be a number.')
            exit()
        if val <= 0.0:
            print('Error: distance_scale must be a strictly positive number.')
            exit()
        elif val > self._distance_scale_max:
            print('Error: distance_scale must be less than %i.' % self._distance_scale_max)
            exit()
        self._distance_scale = val
        self.dist = np.power(self.orig_dist.copy()+1.0, val) - 1.0


class RepvarValidationError(ValueError):
    def __init__(self, *args, **kwargs):
        ValueError.__init__(self, *args, **kwargs)
class RepvarRuntimeError(RuntimeError):
    def __init__(self, *args, **kwargs):
        RuntimeError.__init__(self, *args, **kwargs)


# TODO:
# The sliding scale does not appear to be changing the results, either applied to the dist matrix or to the summed score of a cluster. In theory it is able to, but it might have to be very dramatic to do so.
# Should be a sliding scale for priority: what is best, some strains hit very well but some missed by a lot, or all strains hit decently?
  # I think that if this is changed, there's probably a way to check if the clustering has to be redone or not (the pattern cannot be improved unless the scaling changes a distance by more than x). Prevent too much of the algorithm from being rerun.
  # I think ((d+1.0)**x)-1.0 is probably good, where x is the sliding scale. The +1.0 is necessary because between 0 and 1 sqrt increases the value, while it decreases the values above 1 (which is what I want; also I may have some distances above and some below 1).
    # x=1.0 is regular distances. x<1 makes long distances more acceptable (so getting lots of close hits is prioritized). x>1 makes long distances more costly, so the medeoids will try to cover everything poorly instead of a few things very well.
