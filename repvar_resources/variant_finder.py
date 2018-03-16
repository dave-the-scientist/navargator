"""
Defines the following public functions:
  load_repvar_file(file_path)
"""
import os, itertools, random, time
from math import log, exp
import numpy as np
from tree_parse import TreeParser

# # # # #  Variables  # # # # #
ignore_nodes_tag = 'ignored variants'
available_nodes_tag = 'available variants'
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
    data = {}
    def process_tag_data(tag, data_buff):
        if tag in data:
            print('Error: the repvar file %s has multiple sections labeled "[%s]".' % (file_path, tag))
            exit()
        if not data_buff:
            return
        if tag in (ignore_nodes_tag, available_nodes_tag):
            val = ','.join(data_buff)
            val_list = val.split(',')
            data[tag] = val_list
        elif tag == tree_data_tag:
            data[tag] = data_buff[0]
        else:
            data[tag] = data_buff
    with open(file_path) as f:
        tag, data_buff = '', []
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'): continue
            if line.startswith('[') and line.endswith(']'):
                process_tag_data(tag, data_buff)
                tag, data_buff = line[1:-1], []
            else:
                data_buff.append(line)
        process_tag_data(tag, data_buff)
    vfinder = VariantFinder(data[tree_data_tag], tree_format='newick', tree_is_string=True, verbose=verbose)
    avail = data.get(available_nodes_tag)
    if avail:
        vfinder.available = avail
    ignor = data.get(ignore_nodes_tag)
    if ignor:
        vfinder.ignored = ignor
    return vfinder
def binomial_coefficient(n, k):
    """Quickly computes the binomial coefficient of n-choose-k. This may not be exact due to floating point errors and the log conversions."""
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
    def __init__(self, tree_file, tree_format='newick', tree_is_string=False, allowed_wait=None, verbose=True):
        self.verbose = bool(verbose)
        if tree_is_string == True:
            self.tree = TreeParser(None, tree_format, tree_as_string=tree_file, verbose=self.verbose)
        else:
            self.tree = TreeParser(tree_file, tree_format, verbose=self.verbose)
        self.leaves = self.tree.leaves # List of all terminal leaves in tree_file
        self.index = self.tree.index # The index of each sequence name in self.leaves
        self.dist = self.tree.dist.copy()
        self.cache = {}

        self._ignored = set() # Accessible as self.ignored
        self._available = set(self.leaves) # Accessible as self.available
        self._distance_scale = 1.0 # Accessible as self.distance_scale
        # # #  Private attributes # # #
        self._ingroup_indices = set(range(len(self.leaves)))
        self._cluster_methods = set(['k medoids', 'brute force'])
        self._distance_scale_max = 1000
        self._max_brute_force_attempts = 1000000 # Under 1 minute for 1 million.
        # # Code to clean dead instances:
        self.been_processed, self.html_loaded = False, False
        self._allowed_wait = allowed_wait # Only used by collect_garbage() in repvar_daemon.py
        self.last_maintained = time.time()

    # # # # #  Public methods  # # # # #
    def find_variants(self, num_variants, distance_scale=None, method=None, bootstraps=10):
        num_avail = len(self.available)
        if not 1 <= num_variants <= num_avail:
            print('Error: num_variants must be an integer greater than 1 but less than or equal to the number of designated available nodes (currently: %i).' % num_avail)
            exit()
        if distance_scale != None:
            self.distance_scale = distance_scale
        params = (num_variants, self.distance_scale)
        if params in self.cache:
            variants, scores, alt_variants = self.cache[params]['variants'], self.cache[params]['scores'], self.cache[params]['alt_variants']
            return variants, scores, alt_variants
        num_possible_combinations = binomial_coefficient(num_avail, num_variants)
        if self.verbose:
            print('\nThere are %s possible combinations of variants.' % format_integer(num_possible_combinations))
            init_time = time.time()
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
        if num_variants == num_avail:
            variants = list(self.available)
            scores = [0.0 for n in range(num_avail)]
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
        self.cache[params] = {'variants':variants, 'scores':scores, 'alt_variants':alt_variants}
        return variants, scores, alt_variants

    def save_repvar_file(self, file_path):
        if not file_path.lower().endswith('.repvar'):
            file_path += '.repvar'
        buff = []
        if self.ignored:
            ignor_names = ', '.join(sorted(self.ignored))
            buff.append('[%s]\n%s' % (ignore_nodes_tag, ignor_names))
        if len(self.available) != len(self._ingroup_indices):
            avail_names = ', '.join(sorted(self.available))
            buff.append('[%s]\n%s' % (available_nodes_tag, avail_names))
        buff.append('[%s]\n%s' % (tree_data_tag, self.tree.tree_data))
        with open(file_path, 'w') as f:
            f.write('\n\n'.join(buff))
        if self.verbose:
            print('\nData saved to %s' % file_path)

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
            optima_percent = round(opt_count * 100.0 / bootstraps, 0)
            if self.verbose:
                if len(ranked_vars) == 1:
                    print('One unique solution found after %i bootstraps.' % (bootstraps))
                elif alt_optima == 0:
                    imprv_percent = round((optima[ranked_vars[1]]['score'] - optima[ranked_vars[0]]['score']) * 100.0 / optima[ranked_vars[0]]['score'], 1)
                    print('%i solutions found after %i bootstraps; %i%% consensus for the optimum (%.1f%% improvement over solution #2).' % (len(ranked_vars), bootstraps, optima_percent, imprv_percent))
                else:
                    print('%i solutions found after %i bootstraps; %i%% consensus for the optimum (from %i equivalent solutions).' % (len(ranked_vars), bootstraps, optima_percent, alt_optima+1))
        return best_variants, best_scores, alt_variants
    def _brute_force_clustering(self, num_variants):
        all_medoid_indices = sorted(self.index[n] for n in self.available)
        best_med_inds, best_scores, best_score = None, None, float('inf')
        alt_variants = []
        for med_inds in itertools.combinations(all_medoid_indices, num_variants):
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
        all_medoid_indices = sorted(self.index[n] for n in self.available)
        best_med_inds = np.array(random.sample(all_medoid_indices, num_variants))
        best_clusters = self._partition_nearest(best_med_inds)
        best_scores = self._sum_dist_scores(best_med_inds, best_clusters)
        best_score = sum(best_scores)
        improvement = True
        while improvement == True:
            improvement = False
            med_inds = best_med_inds.copy()
            for i in range(num_variants):
                for ind in all_medoid_indices:
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
    def _sum_dist_scores(self, medoids, clusters):
        return [sum(self.dist[med,inds]) for med,inds in zip(medoids,clusters)]

    # # # # #  Private methods  # # # # #
    def _partition_nearest(self, medoids):
        """Given an array of indices, returns a list of lists, where the ith sublist contains the indices of the nodes closest to the ith medoid in inds."""
        # TODO: This should probably look for ties (or where the difference is below some threshold).
        closest_medoid_ind = np.argmin(self.dist[:,medoids], 1) # If len(inds)==3, would look like [2,1,1,0,1,2,...].
        clusts = [[] for i in medoids]
        for node_ind, med_ind in enumerate(closest_medoid_ind):
            if node_ind in self._ingroup_indices:
                clusts[med_ind].append(node_ind)
        return clusts

    # # # # #  Accessible attribute logic  # # # # #
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
            node = node.strip()
            if node not in self.index:
                print('Error: could not add "%s" to the ignored set, as it was not found in the tree.' % node)
                exit()
            if node in self._available:
                self._available.remove(node)
            new_ingroup_inds.remove(self.index[node])
            new_ignored.add(node)
        if new_ignored != self._ignored:
            self._ignored = new_ignored
            self._ingroup_indices = new_ingroup_inds
            self.cache = {}

    @property
    def available(self):
        return self._available
    @available.setter
    def available(self, names):
        if isinstance(names, basestring):
            names = [names]
        if not names:
            new_avail = set(node for node in self.leaves if node not in self.ignored)
        else:
            new_avail = set()
            for node in names:
                node = node.strip()
                if node not in self.index:
                    print('Error: could not add "%s" as an available node, as it was not found in the tree.' % node)
                    exit()
                if node not in self._ignored:
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
        self.dist = np.power(self.tree.dist.copy()+1.0, val) - 1.0

    # # # # #  Methods for cleaning up dead instances  # # # # #
    def processed(self, num_variants, method=None, distance_scale=None, bootstraps=10):
        if self.been_processed or self.html_loaded:
            raise RepvarRuntimeError('repvar instance cannot be processed twice, and must be processed before being loaded by the results page.')
        self.find_variants(num_variants, distance_scale=distance_scale, method=method, bootstraps=bootstraps)
        self.been_processed = True
        self.last_maintained = time.time()
    def page_loaded(self):
        if not self.been_processed:
            raise RepvarRuntimeError('repvar instance cannot be loaded by the results page before being processed.')
        self.html_loaded = True
        self.last_maintained = time.time()
    def maintain(self):
        if not self.been_processed or not self.html_loaded:
            raise RepvarRuntimeError('repvar instance should not be maintained before being processed and loaded by the results page.')
        self.last_maintained = time.time()
    def still_alive(self):
        age = time.time() - self.last_maintained
        if not self.been_processed:
            if age >= self._allowed_wait['after_instance']:
                return False
        elif not self.html_loaded:
            if age >= self._allowed_wait['page_load']:
                return False
        else:
            if age >= self._allowed_wait['between_checks']:
                return False
        return True

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
