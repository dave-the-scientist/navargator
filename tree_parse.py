import os, itertools
import numpy as np

class TreeParser(object):
    def __init__(self, tree_file, tree_format):
        if not os.path.isfile(tree_file):
            print('Error: could not find the given tree file "%s"' % tree_file)
            exit()
        self.leaves = [] # List of all terminal leaves in tree_file
        self.index = {} # The index of each sequence name in self.leaves
        self.dist = None # Numpy distance matrix, where self.dist[i,j] is the distance between the ith and jth nodes from self.leaves.
        if tree_format == 'newick':
            self._parse_newick_tree_file(tree_file)
        else:
            print('Error: tree format "%s" not recognized.' % tree_format)
            exit()
    # # # # #  Private methods  # # # # #
    def _parse_newick_tree_file(self, tree_file):
        print('Reading tree file and calculating distance matrix...')
        self._root_node, self._nodes = None, set()
        with open(tree_file) as f:
            edges, parent = self._parse_newick_nodes_edges(f.read())
        leaf_paths = self._get_leaf_paths(parent)
        self._generate_dist_matrix(leaf_paths, edges)
        print('Finished loading information from tree with %i nodes.' % len(self.leaves))
    # # #  Parsing the tree file  # # #
    def _parse_newick_nodes_edges(self, newick_str):
        root_node = newick_str[newick_str.rindex(')')+1:-1]
        if not root_node: root_node = 'root'
        self._root_node = root_node
        nodes_start = newick_str.find('(')
        node_gen_int = 0
        parents = set()
        edges, parent = {}, {}
        while True:
            i, j = self._find_parentheses(newick_str)
            if i == nodes_start: pnode = root_node
            else:
                k = min(x for x in [newick_str.find(c,j+1) for c in ':,)'] if x>j)
                pnode = newick_str[j+1 : k]
            # pnode in parents or pnode in parent doesn't seem to happen on normal trees; what am I checking for?
            if not pnode or pnode in parents or pnode in parent:
                pnode += '_%i' % node_gen_int
                node_gen_int += 1
            self._nodes.add(pnode); parents.add(pnode)
            for datum in newick_str[i+1:j].split(','):
                node, _, weight = datum.partition(':')
                if not node or node in parent:
                    node += '_%i' % node_gen_int
                    node_gen_int += 1
                if not weight:
                    weight = default_weight
                else:
                    weight = float(weight)
                edges[pnode, node] = weight
                parent[node] = pnode
                self._nodes.add(node)
            if pnode == root_node: break
            newick_str = '%s%s%s' % (newick_str[:i], pnode, newick_str[k:]) ###
        self.leaves = sorted([node.replace(',','') for node in self._nodes if node not in parents])
        for i, node in enumerate(self.leaves):
            self.index[node] = i
        return edges, parent
    def _find_parentheses(self, n_str):
        j = n_str.find(')')
        i = n_str[:j].rfind('(')
        return i, j
    # # #  Calculating the distance matrix  # # #
    def _get_leaf_paths(self, parent):
        leaf_paths = {}
        for leaf in self.leaves:
            pnode, path = leaf, [leaf]
            while pnode != self._root_node:
                pnode = parent[pnode]
                path.append(pnode)
            path.reverse()
            leaf_paths[leaf] = path
        return leaf_paths
    def _generate_dist_matrix(self, leaf_paths, edges):
        l = len(self.leaves)
        self.dist = np.zeros((l, l) ,dtype='float')
        for (node1, node2), (i, j) in zip(
            itertools.combinations(self.leaves, 2),
            itertools.combinations(range(len(self.leaves)), 2)):
            d = self._calc_leaf_dist(leaf_paths[node1], leaf_paths[node2], edges)
            self.dist[i,j] = d
            self.dist[j,i] = d
    def _calc_leaf_dist(self, path1, path2, edges):
        i = -1
        for n1, n2 in zip(path1, path2):
            if n1 == n2: i += 1
            else: break
        return self._calc_path_dist(path1[i:], edges) + self._calc_path_dist(path2[i:], edges)
    def _calc_path_dist(self, path, edges):
        dist = 0.0
        node1 = path[0]
        for node2 in path[1:]:
            dist += edges[node1, node2]
            node1 = node2
        return dist
