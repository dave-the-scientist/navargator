import os, itertools
import numpy as np
import xml.etree.ElementTree as ET
from repvar_resources.convert import NewickToPhyloxml

class TreeParser(object):
    def __init__(self, tree_input, tree_format, verbose=False):
        # The code in _parse_newick_nodes_edges is basically the same as in NewickToPhyloxml from convert.py. Combine them, so work isn't duplicated, and to ensure both methods are parsing the same.
        if os.path.isfile(tree_input):
            self.tree_data = open(tree_input).read()
        else:
            self.tree_data = tree_input
        self.verbose = verbose
        self.leaves = [] # List of all terminal leaves in the tree
        self.index = {} # The index of each sequence name in self.leaves
        self.dist = None # Numpy distance matrix, where self.dist[i,j] is the distance between the ith and jth nodes from self.leaves.
        if tree_format == 'newick':
            self._parse_newick_tree()
        else:
            print('Error: tree format "%s" not recognized.' % tree_format)
            exit()
        self.phylo_xml_data = self._convert_newick_phyloxml()
    # # # # #  Private methods  # # # # #
    def _parse_newick_tree(self):
        if self.verbose:
            print('Reading tree data and calculating distance matrix...')
        if '\n' in self.tree_data: # In case it's split over multiple lines for some reason.
            self.tree_data = ''.join(self.tree_data.split())
        self._root_node, self._nodes = None, set()
        edges, parent = self._parse_newick_nodes_edges()
        leaf_paths = self._get_leaf_paths(parent)
        self._generate_dist_matrix(leaf_paths, edges)
        if self.verbose:
            print('Finished loading information from tree with %i nodes.' % len(self.leaves))
    def _convert_newick_phyloxml(self):
        converter = NewickToPhyloxml(self.tree_data)
        for child in converter.etree:
            tag = child.tag.lower()
            if 'phylogeny' in tag:
                phylogeny = child
                ns = child.tag[ : tag.find('phylogeny')] # xml namespace
                break
        else:
            print('Error parsing phyloxml file of tree')
            exit()
        # Clean out render, charts, styles, if any data was present.
        render = self._xmlSubElement(phylogeny, 'render')
        charts = self._xmlSubElement(render, 'charts')
        styles = self._xmlSubElement(render, 'styles')
        for clade in converter.etree.findall(".//%sname/.." % ns):
            seqID = clade.find("%sname" % ns).text
            for child in clade:
                if child.tag in ('annotation', "%sannotation" % ns):
                    clade.remove(child)
            chrt = self._xmlSubElement(clade, 'chart')
        return converter.tostring()

    # # #  Parsing the tree data  # # #
    def _parse_newick_nodes_edges(self):
        newick_str = self.tree_data
        root_node = newick_str[newick_str.rindex(')')+1:-1]
        if not root_node: root_node = 'root'
        self._root_node = root_node
        nodes_start = newick_str.find('(')
        node_gen_int = 0
        parents = set()
        edges, parent = {}, {}
        while True:
            i, j = self._find_parentheses(newick_str)
            if i == nodes_start:
                pnode = root_node
            else:
                k = min(x for x in [newick_str.find(c,j+1) for c in ':,)'] if x>j)
                pnode = newick_str[j+1 : k]
                # If : is the closest, there is a branch length. If that's true, newick_str[j+1:k] will contain the bootstrap/SH/etc value, if there is one. pnode will be that value if present.
            if not pnode or pnode in parents or pnode in parent:
                # This does occur, so is needed.
                pnode += '_%i' % node_gen_int
                node_gen_int += 1
            self._nodes.add(pnode); parents.add(pnode)
            for datum in newick_str[i+1:j].split(','):
                node, _, weight = datum.partition(':')
                node = node.strip()
                if not node or node in parent:
                    node += '_%i' % node_gen_int
                    node_gen_int += 1
                if node[0] == node[-1] == "'":
                    node = node[1:-1] # Removes quotes added by Figtree.
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
    def _xmlSubElement(self, parent, tag):
        for child in parent:
            if child.tag == tag:
                return child
        return ET.SubElement(parent, tag)
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
