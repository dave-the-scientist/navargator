import itertools, random, time
from math import log, exp
import numpy as np
from tree_parse import TreeParser

# # # # #  Misc functions  # # # # #
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
    def __init__(self, tree_file, tree_format='newick', verbose=True):
        self.verbose = bool(verbose)
        self.tree = TreeParser(tree_file, tree_format, verbose=verbose)
        self.leaves = self.tree.leaves # List of all terminal leaves in tree_file
        self.index = self.tree.index # The index of each sequence name in self.leaves
        self.orig_dist = self.tree.dist
        self.dist = self.orig_dist.copy()

        self._ignored = set() # Accessible as self.ignored
        self._available = set(self.leaves) # Accessible as self.available
        self._distance_scale = 1.0 # Accessible as self.distance_scale
        # # #  Private attributes # # #
        self._ingroup_indices = set(range(len(self.leaves)))
        self._cluster_methods = set(['k medoids', 'brute force'])
        self._distance_scale_max = 1000
        self._max_brute_force_attempts = 10000000 # Approx 7 minutes for 10 million.

    # # # # #  Public methods  # # # # #
    def find_variants(self, num_variants, distance_scale=None, method=None, bootstraps=10):
        num_avail = len(self.available)
        if not 1 <= num_variants <= num_avail:
            print('Error: num_variants must be an integer greater than 1 but less than or equal to the number of designated available nodes (currently: %i).' % num_avail)
            exit()
        if distance_scale != None:
            self.distance_scale = distance_scale
        num_possible_combinations = binomial_coefficient(num_avail, num_variants)
        if self.verbose:
            print('\nThere are %s possible combinations of variants.' % format_integer(num_possible_combinations))
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
        init_time = time.time()
        if num_variants == num_avail:
            variants = list(self.available)
            scores = [0.0 for n in range(num_avail)]
        elif method == 'brute force':
            if self.verbose:
                expected_runtime = int(round(num_possible_combinations * 0.000042, 0))
                print('Finding globally optimal variants using brute force. This should take ~%i seconds...' % expected_runtime)
            variants, scores = self._brute_force_clustering(num_variants)
        elif method == 'k medoids':
            if self.verbose:
                print('Choosing variants using k medoids...')
            fxn, args = self._cluster_k_medoids, (num_variants,)
            variants, scores = self._heuristic_rand_starts(fxn, args, bootstraps)
            #variants, scores = self._cluster_k_medoids(num_variants)
        else:
            print('Error: clustering method "%s" is not recognized.' % method)
            exit()
        if self.verbose:
            finish_time = time.time()
            variant_names = ', '.join(sorted(self.leaves[v] for v in variants))
            print('Found %i variants in %.2f seconds.' % (num_variants, finish_time-init_time))
            print('\nBest score: %f\nBest variants: %s' % (sum(scores), variant_names))
        return variants, scores

    # # # # #  Clustering methods  # # # # #
    def _heuristic_rand_starts(self, fxn, args, bootstraps):
        optima = {}
        for i in range(bootstraps):
            variants, scores = fxn(*args)
            var_tup = tuple(sorted(variants))
            if var_tup in optima:
                optima[var_tup]['count'] += 1
            else:
                score = sum(scores)
                optima[var_tup] = {'count':1, 'score':score, 'variants':variants, 'scores':scores}
        ranked_vars = sorted(optima.keys(), key=lambda opt: optima[opt]['score'])
        best_variants, best_scores = optima[ranked_vars[0]]['variants'], optima[ranked_vars[0]]['scores']
        if self.verbose and bootstraps > 1:
            equal_optima = 0
            for rv in ranked_vars:
                if optima[rv]['score'] == sum(best_scores):
                    equal_optima += 1
                else:
                    break
            if len(ranked_vars) == 1:
                print('Only 1 solution found after %i bootstraps.' % (bootstraps))
            elif equal_optima == 1:
                best_percent = round(optima[ranked_vars[0]]['count'] * 100.0 / bootstraps, 0)
                imprv_percent = round((optima[ranked_vars[1]]['score'] - optima[ranked_vars[0]]['score']) * 100.0 / optima[ranked_vars[0]]['score'], 1)
                print('%i solutions found after %i bootstraps; %i%% consensus for the optimum (%.1f%% improvement over solution #2).' % (len(ranked_vars), bootstraps, best_percent, imprv_percent))
            else:
                best_percent = round(sum(optima[rv]['count'] for rv in ranked_vars[:equal_optima]) * 100.0 / bootstraps, 0)
                print('%i solutions found after %i bootstraps; %i%% consensus for the optimum (from %i equivalent solutions):' % (len(ranked_vars), bootstraps, best_percent, equal_optima))
                for rv in ranked_vars[1:equal_optima]:
                    alt_vars = ', '.join(sorted( self.leaves[med_ind] for med_ind in optima[rv]['variants'] ))
                    print('Alternate variants: %s' % (alt_vars))
        return best_variants, best_scores
    def _brute_force_clustering(self, num_variants):
        all_medoid_indices = sorted(self.index[n] for n in self.available)
        best_med_inds, best_scores, best_score = None, None, float('inf')
        for med_inds in itertools.combinations(all_medoid_indices, num_variants):
            clusters = self._partition_nearest(med_inds)
            scores = self._sum_dist_scores(med_inds, clusters)
            score = sum(scores)
            if score < best_score:
                best_med_inds, best_scores, best_score = med_inds, scores, score
        if best_med_inds == None:
            print('Error: big problem in brute force clustering, no comparisons were made.')
            exit()
        return best_med_inds, best_scores
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
        return [((sum(self.dist[med,inds])+1.0)**(self.test_distance_scale)-1.0) for med,inds in zip(medoids,clusters)]
        #return [sum(self.dist[med,inds]) for med,inds in zip(medoids,clusters)]

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
        # should destroy any existing solution if this is changed.
        new_ignored = set()
        new_ingroup_inds = set(range(len(self.leaves)))
        for node in names:
            if node not in self.index:
                print('Error: could not add "%s" to the ignored set, as it was not found in the tree.' % node)
                exit()
            if node in self._available:
                self._available.remove(node)
            new_ingroup_inds.remove(self.index[node])
            new_ignored.add(node)
        self._ignored = new_ignored
        self._ingroup_indices = new_ingroup_inds

    @property
    def available(self):
        return self._available
    @available.setter
    def available(self, names):
        # should destroy any existing solution if this is changed.
        new_avail = set()
        for node in names:
            if node not in self.index:
                print('Error: could not add "%s" as an available node, as it was not found in the tree.' % node)
                exit()
            if node not in self._ignored:
                new_avail.add(node)
        self._available = new_avail

    @property
    def distance_scale(self):
        return self._distance_scale
    @distance_scale.setter
    def distance_scale(self, val):
        # May have to modify or discard a solution if this is changed.
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



tree_file = "/home/dave/Desktop/old_projects/porcine_diversity/ap_hp_tbpb_mcoffee.phylip_phyml_tree.txt"
vfinder = VariantFinder(tree_file)
vfinder.ignored = ['L20[A.p]', 'Ap76[A.p]', 'ApJL03[A.p']
#vfinder.available = ['h87[A.p|sv', 'h49[A.p|sv', 'h57[A.suis', 'c15[H.p|nt']
#vfinder.available = vfinder.leaves[:20]
vfinder.test_distance_scale = 0.1
vfinder.find_variants(10, method='k medoids', bootstraps=10)


# TODO:
  # Test the effects of the sliding scale. Possibly test applying the transformation to the score calculation instead of the whole matrix (if that would change things; it would certainly be slower).
  # Implement info file saving and loading.

# The sliding scale does not appear to be changing the results, either applied to the dist matrix or to the summed score of a cluster. Should it?
# Should be a sliding scale for priority: what is best, some strains hit very well but some missed by a lot, or all strains hit decently?
  # I think that if this is changed, there's probably a way to check if the clustering has to be redone or not (the pattern cannot be improved unless the scaling changes a distance by more than x). Prevent too much of the algorithm from being rerun.
  # I think ((d+1.0)**x)-1.0 is probably good, where x is the sliding scale. The +1.0 is necessary because between 0 and 1 sqrt increases the value, while it decreases the values above 1 (which is what I want; also I may have some distances above and some below 1).
    # x=1.0 is regular distances. x<1 makes long distances more acceptable (so getting lots of close hits is prioritized). x>1 makes long distances more costly, so the medeoids will try to cover everything poorly instead of a few things very well.
