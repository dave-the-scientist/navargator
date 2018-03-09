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
    def __init__(self, tree_file, tree_format='newick'):
        self.tree = TreeParser(tree_file, tree_format)
        self.leaves = self.tree.leaves # List of all terminal leaves in tree_file
        self.index = self.tree.index # The index of each sequence name in self.leaves
        self.orig_dist = self.tree.dist
        self.dist = self.orig_dist.copy()

        self._outgroup = set() # Accessible as self.outgroup
        self._available = set(self.leaves) # Accessible as self.available
        self._distance_scale = 1.0 # Accessible as self.distance_scale
        # # #  Private attributes # # #
        self._ingroup_indices = set(range(len(self.leaves)))
        self._cluster_methods = set(['k medoids', 'brute force'])
        self._distance_scale_max = 1000
        self._max_brute_force_attempts = 10000000 # Probably ~30 seconds to run a million.

    # # # # #  Public methods  # # # # #
    def find_variants(self, num_variants, distance_scale=None, method='k medoids'):
        num_avail = len(self.available)
        if not 1 <= num_variants <= num_avail:
            print('Error: num_variants must be an integer greater than 1 but less than or equal to the number of designated available nodes (currently: %i).' % num_avail)
            exit()
        method = method.lower()
        if method not in self._cluster_methods:
            print('Error: the given clustering method "%s" is not supported (must be one of: %s).' % ( method, ', '.join(sorted(self._cluster_methods)) ))
            exit()
        if distance_scale != None:
            self.distance_scale = distance_scale
        num_possible_combinations = binomial_coefficient(num_avail, num_variants)
        print('\nThere are %s possible combinations of variants.' % format_integer(num_possible_combinations))
        init_time = time.time()
        if num_variants == num_avail:
            variants = list(self.available)
            scores = [0.0 for n in range(num_avail)]
        elif method == 'brute force' or num_possible_combinations <= self._max_brute_force_attempts:
            expected_runtime = int(round(num_possible_combinations * 0.000042, 0))
            print('Choosing variants using brute force. This should take ~%i seconds...' % expected_runtime)
            variants, scores = self._brute_force_clustering(num_variants)
        elif method == 'k medoids':
            print('Choosing variants using k medoids...')
            variants, scores = self._cluster_k_medoids(num_variants)
        else:
            print('Error: clustering method "%s" is not recognized.' % method)
            exit()
        finish_time = time.time()
        variant_names = ', '.join(self.leaves[v] for v in variants)
        print('Finished finding %i variants in %.2f seconds.' % (num_variants, finish_time-init_time))
        print('\nBest score: %f\nBest variants: %s' % (sum(scores), variant_names))
        return variants, scores

    # # # # #  Accessible attribute logic  # # # # #
    @property
    def outgroup(self):
        return self._outgroup
    @outgroup.setter
    def outgroup(self, names):
        # should destroy any existing solution if this is changed.
        new_outgroup = set()
        new_ingroup_inds = set(range(len(self.leaves)))
        for node in names:
            if node not in self.index:
                print('Error: could not add "%s" to the outgroup, as it was not found in the tree.' % node)
                exit()
            if node in self._available:
                self._available.remove(node)
            new_ingroup_inds.remove(self.index[node])
            new_outgroup.add(node)
        self._outgroup = new_outgroup
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
            if node not in self._outgroup:
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

    # # # # #  Clustering methods  # # # # #
    def _brute_force_clustering(self, num_variants):
        all_medoid_indices = sorted(self.index[n] for n in self.available)
        best_med_inds, best_scores, best_score = None, None, float('inf')
        for med_inds in itertools.combinations(all_medoid_indices, num_variants):
            clusters = self._partition_nearest(med_inds)
            scores = self._k_medoids_scores(med_inds, clusters)
            score = sum(scores)
            if score < best_score:
                best_med_inds, best_scores, best_score = med_inds, scores, score
        if best_med_inds == None:
            print('Error: big problem in brute force clustering, no comparisons were made.')
            exit()
        return best_med_inds, best_scores
    def _cluster_k_medoids(self, num_variants):
        medoids = np.array([self.index[r] for r in random.sample(self.available, num_variants)])
        clusters = self._partition_nearest(medoids)
        scores = self._k_medoids_scores(medoids, clusters)
        return [self.leaves[i] for i in medoids], scores
    def _k_medoids_scores(self, medoids, clusters):
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



tree_file = "/home/dave/Desktop/old_projects/porcine_diversity/ap_hp_tbpb_mcoffee.phylip_phyml_tree.txt"
vfinder = VariantFinder(tree_file)
vfinder.outgroup = ['L20[A.p]', 'Ap76[A.p]', 'ApJL03[A.p']
#vfinder.available = ['h87[A.p|sv', 'h49[A.p|sv', 'h57[A.suis', 'c15[H.p|nt']
vfinder.available = vfinder.leaves[:20]

vfinder.find_variants(6)


# When implementing the actual clustering, check number of combinations. If reasonable, just iterate over them and pick best.
# Should be a sliding scale for priority: what is best, some strains hit very well but some missed by a lot, or all strains hit decently?
  # I think that if this is changed, there's probably a way to check if the clustering has to be redone or not (the pattern cannot be improved unless the scaling changes a distance by more than x). Prevent too much of the algorithm from being rerun.
  # I think ((d+1.0)**x)-1.0 is probably good, where x is the sliding scale. The +1.0 is necessary because between 0 and 1 sqrt increases the value, while it decreases the values above 1 (which is what I want; also I may have some distances above and some below 1).
    # x=1.0 is regular distances. x<1 makes long distances more acceptable (so getting lots of close hits is prioritized). x>1 makes long distances more costly, so the medeoids will try to cover everything poorly instead of a few things very well.
