"""
The Tree class defines the following methods:
  tree.newick_string()
  tree.save_newick()
File format notes:
  Newick - Comments [] can be part of the 'label' and/or 'branch' data of a node in a Newick file or the TREES block of a NEXUS file. They can contain the forbidden characters '(),:', but cannot be nested. If part of the 'label' data, it will always be interpreted as a text comment. If part of the 'branch' data it will be interpreted as a support value if it's numeric, as a text comment if there was no 'label' comment, or discarded if there was.
  NEXUS - Trees must have a name in NEXUS files, and a default name will be used if the Tree.name attribute is not set. Any semicolons within comments (designated by []) will be replaced by periods. If a Translate command is given within the TREES block, the names are replaced by numbers in the tree data itself, and internal nodes are named, those internal names will be interpreted as support values unless real support values are given in a comment on the branch. To prevent this behavior, set 'internal_as_names' to True when parsing the NEXUS file or string.
  PhyloXML - This format supports names for trees, but they are not required. To use a name, set the Tree.name attribute to something other than None.
"""
# All parsing functions must call self.reset_node_ids(), use self.new_tree_node() to create a node and set it as self.root, then the same function for all other nodes in the tree. All nodes must have their .parent and .children attributes set. All nodes should have their .name, .branch, .support, and .support_type attributes filled if possible, though all are optional. Finally, call self.process_tree_nodes() to finish everything.

import re, operator, itertools
import xml.etree.ElementTree as ET
from collections import OrderedDict
import numpy as np


def load_newick(newick_file, internal_as_names=False, **kwargs):
    """'internal_as_names' should be set to True if the internal nodes of the tree are named, and those names are numeric. If it is False they will be considered branch support values, unless support values are found in []-wrapped comments after the branch values."""
    with open(newick_file) as f:
        newick_str = f.read()
    return load_newick_string(newick_str, internal_as_names, **kwargs)
def load_newick_string(newick_str, internal_as_names=False, **kwargs):
    tree = Tree(**kwargs)
    tree.parse_newick(newick_str, internal_as_names)
    return tree

def load_phyloxml(phyloxml_file, **kwargs):
    with open(phyloxml_file) as f:
        phyloxml_str = f.read()
    return load_phyloxml_string(phyloxml_str, **kwargs)
def load_phyloxml_string(phyloxml_str, **kwargs):
    tree = Tree(**kwargs)
    tree.parse_phyloxml(phyloxml_str)
    return tree
def load_multiple_phyloxml(phyloxml_file, **kwargs):
    with open(phyloxml_file) as f:
        phyloxml_str = f.read()
    return load_multiple_phyloxml_string(phyloxml_str, **kwargs)
def load_multiple_phyloxml_string(phyloxml_str, **kwargs):
    tree = Tree(**kwargs)
    return tree.parse_multiple_phyloxml(phyloxml_str)
def save_multiple_phyloxml(trees, filename, support_values=True, comments=True, internal_names=False):
    phylo_str = multiple_phyloxml_string(trees, support_values, comments, internal_names)
    with open(filename, 'w') as f:
        f.write(phylo_str)
def multiple_phyloxml_string(trees, support_values=True, comments=True, internal_names=False):
    e_tree = ET.Element('phyloxml')
    e_tree.set('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
    e_tree.set('xsi:schemaLocation', 'http://www.phyloxml.org http://www.phyloxml.org/1.10/phyloxml.xsd')
    e_tree.set('xmlns', 'http://www.phyloxml.org')
    for tree in trees:
        phylogeny = ET.SubElement(e_tree, 'phylogeny')
        phylogeny.set('rooted', 'true')
        phylogeny.set('rerootable', 'true')
        if tree.name:
            name_e = ET.SubElement(phylogeny, 'name')
            name_e.text = tree.name
        tree.add_nodes_to_phyloxml(tree.root, phylogeny, support_values, comments, internal_names)
    return ET.tostring(e_tree, encoding='UTF-8', method='xml').decode()

def load_nexus(nexus_file, internal_as_names=False, **kwargs):
    with open(nexus_file) as f:
        nexus_str = f.read()
    return load_nexus_string(nexus_str, internal_as_names, **kwargs)
def load_nexus_string(nexus_str, internal_as_names=False, **kwargs):
    tree = Tree(**kwargs)
    tree.parse_nexus(nexus_str, internal_as_names)
    return tree
def load_multiple_nexus(nexus_file, internal_as_names=False, **kwargs):
    with open(nexus_file) as f:
        nexus_str = f.read()
    return load_multiple_nexus_string(nexus_str, internal_as_names, **kwargs)
def load_multiple_nexus_string(nexus_str, internal_as_names=False, **kwargs):
    tree = Tree(**kwargs)
    return tree.parse_multiple_nexus(nexus_str, internal_as_names)
def save_multiple_nexus(trees, filename, translate_command=False, support_values=True, comments=True, internal_names=False, support_as_comment=False):
    nexus_str = multiple_nexus_string(trees, translate_command, support_values, comments, internal_names, support_as_comment)
    with open(filename, 'w') as f:
        f.write(nexus_str)
def multiple_nexus_string(trees, translate_command=False, support_values=True, comments=True, internal_names=False, support_as_comment=False):
    indent = '    '
    nexus_buff, tree_names = ['#NEXUS', '', 'BEGIN TREES;'], set()
    if translate_command:
        new_trees, trans_dict, trans_ind = [], {}, 1
        for tree in trees:
            new_tree = tree.copy()
            new_trees.append(new_tree)
            nodes = new_tree.nodes if internal_names else new_tree.leaves
            for node in nodes:
                if node.name in trans_dict:
                    new_name = trans_dict[node.name]
                else:
                    new_name = str(trans_ind)
                    trans_dict[node.name] = new_name
                    trans_ind += 1
                node.rename(new_name)
        trees = new_trees
        trans_buff = []
        for orig_name in sorted(trans_dict, key=lambda name: int(trans_dict[name])):
            trans_buff.append('{}{} {}'.format(indent, trans_dict[orig_name], orig_name))
        nexus_buff.append('{}Translate\n{};'.format(indent, ',\n'.join(trans_buff)))
    for tree in trees:
        tree_name_ind = 2
        newick_str = tree.newick_string(support_values, comments, internal_names, support_as_comment)
        tree_name = tree.name if tree.name else 'tree'
        if tree_name in tree_names:
            while '{}_{}'.format(tree_name, tree_name_ind) in tree_names:
                tree_name_ind += 1
            tree_name = '{}_{}'.format(tree_name, tree_name_ind)
        tree_names.add(tree_name)
        nexus_buff.append('{}Tree {} = {}'.format(indent, tree_name, newick_str))
    nexus_buff.append('END;')
    return '\n'.join(nexus_buff)


class Tree(object):
    def __init__(self, support_label='bootstrap', cladogram_branch=1.0, remove_name_quotes=True):
        """Data structure used to parse and manipulate phylogenetic trees.

        'cladogram_branch' can be used to set the default length of a branch in a cladogram. If the phylogenetic tree contains no branch lengths this value will be used, but if there is a single branch length then all other branches will be set to 0.
        'remove_name_quotes' removes the quotations that some programs (like FigTree) add around certain node names. Set to False if you want the quotations to remain.
        """
        self.name = None
        self.node_names = {} # Maps a name to its TreeNode object
        # Variables involving TreeNode objects:
        self.root = None
        self.leaves = set()
        self.internal = set()
        self.nodes = set()
        self.paths = {}
        self.path_dists = {}
        # # #  Private attributes
        self._is_cladogram = None # None means it hasn't been set; will be True or False
        self._cladogram_branch = cladogram_branch # length of each branch in a cladogram
        self._remove_name_quotes = remove_name_quotes
        self._support_label = support_label
        self._node_ids = set()
        self._node_id_template = '_node_{}'
        self._node_id_index = 0
        self._max_precision = 10

    # # #  Public functions
    def reorder_children(self, increasing=True):
        """Reorders each node's children for asthetic purposes.
        If increasing=True, children are ordered so that short leaves come before leaves with long branches, which come before children that are internal nodes. Setting increasing=False reverses this."""
        self.traverse_order_children(self.root, increasing)
    def replace_names(self, replacements):
        """Expects 'replacements' to be a dictionary={'pattern':'new_text', ...}, that will replace the string 'pattern' with 'new_text' in a single pass in all node names."""
        replacer = self.create_string_replacer_function(replacements)
        for node in self.nodes:
            if node.name is not None and node.name != node.id:
                node.name = replacer(node.name)
    def set_cladogram(self, cladogram_branch=1.0):
        """Sets the tree to be a cladogram, so no branch lengths will be saved.
        The argument cladogram_branch can be used to set the default length, used for some manipulations; the value should have a very minimal effect."""
        self._is_cladogram = True
        self._cladogram_branch = cladogram_branch
        for node in self.nodes:
            if node != self.root:
                node.branch = cladogram_branch
        self.root.branch = 0.0
    def set_support_type(self, support_type):
        """Allows the type of support to be set. This is saved in some formats (PhyloXML and NeXML) but ignored in others (Newick, NEXUS)."""
        for node in self.nodes:
            if node.support is not None:
                node.support_type = support_type
    def clear_supports(self, value, relation='<'):
        """Removes all support values in the tree < the given 'value'. This can be modified by setting the 'relation' argument to one of: '<', '<=', '>', '>=', '=', '=='."""
        compare = {'<':operator.lt, '<=':operator.le, '>':operator.gt, '>=':operator.ge, '=':operator.eq, '==':operator.eq}.get(relation, None)
        if relation is None:
            raise PhyloValueError("Error: the 'relation' argument to clear_supports must be one of: '<', '<=', '>', '>=', '=', '=='.")
        for node in self.nodes:
            if node.support is not None and compare(node.support, value):
                node.support = None
                node.support_type = None
    def clear_negative_branches(self, new_value=0.0):
        """Sets all negative branch lengths in the tree to new_value=0.0"""
        for node in self.nodes:
            if node.branch is not None and node.branch < 0:
                node.branch = new_value
        self.process_tree_nodes()
    def balance_negative_branches(self, new_value=0.0):
        """Attempts to set all negative branch lengths to new_value=0.0, while shortening the branch's sibling to account for the negative branch."""
        for node in self.nodes:
            if node.branch is not None and node.branch < 0 and node != self.root:
                neg_sibs, pos_sibs, neg_delta, min_pos = [], [], 0, float('inf')
                for sib in node.parent.children:
                    if sib.branch is not None and sib.branch < 0:
                        neg_sibs.append(sib)
                        neg_delta += sib.branch
                        neg_delta -= new_value
                    elif sib.branch is not None and sib.branch >= 0:
                        pos_sibs.append(sib)
                        if sib.branch < min_pos:
                            min_pos = sib.branch
                if len(pos_sibs) == 0:
                    print("Warning: could not balance the negative branch of node '{}' as it has no siblings with positive branches.".format(node.name))
                    continue
                neg_delta /= float(len(pos_sibs))
                if abs(neg_delta) > min_pos:
                    print("Warning: could not balance the negative branch of node '{}' as its siblings' branches were not long enough to accommodate it.".format(node.name))
                    continue
                for neg in neg_sibs:
                    neg.branch = new_value
                for pos in pos_sibs:
                    pos.branch += neg_delta
        self.process_tree_nodes()

    # # #  Public functions for working with my data structures
    def copy(self):
        """Returns a deep copy of the current Tree object."""
        new_tree = Tree(support_label=self._support_label, cladogram_branch=self._cladogram_branch, remove_name_quotes=self._remove_name_quotes)
        new_tree.name = self.name
        new_tree._is_cladogram = self._is_cladogram
        new_tree._node_id_template = self._node_id_template
        new_tree._node_id_index = self._node_id_index
        new_tree.root = self.root.copy(new_tree)
        self.copy_nodes(self.root, new_tree.root, new_tree)
        new_tree.process_tree_nodes()
        return new_tree
    def get_nodes(self, names):
        """Given a list of strings, returns a list of TreeNode objects representing those nodes."""
        nodes = []
        for name in names:
            if self._remove_name_quotes and (name[0] == name[-1] == "'" or name[0] == name[-1] == '"'):
                name = name[1:-1]
            if name not in self.node_names:
                print('Warning: could not find a tree node named {}.'.format(name))
            else:
                nodes.append(self.node_names[name])
        return nodes
    def node_distance(self, node1, node2):
        """Returns the phylogenetic distance between the two TreeNode objects."""
        if node1 == node2:
            return 0.0
        for i, (n1, n2) in enumerate(zip(self.paths[node1], self.paths[node2])):
            if n1 != n2:
                break
        else:
            i = min(len(self.paths[node1]), len(self.paths[node2]))
        return sum(self.path_dists[node1][i:]) + sum(self.path_dists[node2][i:])
    def get_recent_common_ancestor(self, nodes):
        """Given a list of TreeNode objects, returns the most recent commont ancestor TreeNode shared by all."""
        if len(nodes) == 0:
            raise PhyloValueError("Error: could not determing the recent common ancestor, as no nodes were given.")
        elif len(nodes) == 1:
            return nodes[0]
        ancestor = None
        for ancestor_nodes in zip(*(self.paths[node] for node in nodes)):
            nodes_set = set(ancestor_nodes)
            if len(nodes_set) == 1:
                ancestor = nodes_set.pop()
            else:
                break
        if ancestor == None:
            raise PhyloValueError("Error: could not determing the recent common ancestor. This might indicate the tree structure is malformed.")
        return ancestor
    def get_node_leaves(self, node):
        """Returns a set of TreeNode objects that are the terminal children of the given node."""
        if node not in self.nodes:
            raise PhyloValueError("Error: cannot get the leaves of an invalid node.")
        if node in self.leaves:
            return set(node)
        children = set()
        for leaf in self.leaves:
            if node in self.paths[leaf]:
                children.add(leaf)
        return children
    def get_node_subtree(self, node, keep_root_branch=False):
        """Returns a new Tree object of the subtree rooted at node."""
        subtree = Tree(support_label=self._support_label, cladogram_branch=self._cladogram_branch, remove_name_quotes=self._remove_name_quotes)
        subtree._is_cladogram = self._is_cladogram
        subtree._node_id_template = self._node_id_template
        subtree.root = node.copy(subtree)
        if not keep_root_branch:
            subtree.root.branch = 0.0
        self.copy_nodes(node, subtree.root, subtree)
        subtree.process_tree_nodes()
        return subtree
    def get_subtree(self, names, keep_root_branch=False):
        """Returns a new Tree object of the subtree containing all nodes specified by 'names'."""
        nodes = self.get_nodes(names)
        rca = self.get_recent_common_ancestor(nodes)
        return self.get_node_subtree(rca, keep_root_branch)

    # # #  Tree rooting functions
    def root_midpoint(self):
        """Identifies the two leaves that are furthest apart in the tree, and roots the tree halfway between them. This is a good way to root a tree if you lack an outgroup."""
        node1, node2, distance = self.find_middle_point()
        self.root_nodes(node1, node2, distance)
    def root_outgroup(self, outgroup, distance=0.5, distance_fraction=True):
        """Re-roots the tree using the specified outgroup.
        'outgroup' should be a sequence of node names, and the root will be placed between the most recent common ancestor of 'outgroup' and its sibling. If 'distance_fraction' is True, the root will be placed 'distance' fraction of the distance between the two nodes (distance=0.25 means the root will be placed 25% of the distance between the outgroup ancestor and its sibling). If 'distance_fraction' is False, the root will be placed 'distance' away from the outgroup ancestor.
        If the most recent common ancestor of the outgroup is not the root in the current tree representation, then 'outgroup' only needs to contain as few as 2 names that share that most recent common ancestor."""
        outgroup_nodes = self.get_nodes(outgroup)
        if not outgroup_nodes:
            raise PhyloValueError('Error: could not root the tree as no valid outgroup was provided.')
        ancestor = self.get_recent_common_ancestor(outgroup_nodes)
        if ancestor != self.root:
            node1 = ancestor
            node2 = ancestor.parent
        else:
            not_outgroup = [node for node in self.leaves if node not in outgroup_nodes]
            ancestor = self.get_recent_common_ancestor(not_outgroup)
            if ancestor == self.root:
                raise PhyloValueError('Error: could not root the tree with the given outgroup. If the outgroup spans the root in the current tree representation, ensure that you include every leaf that should be part of the outgroup.')
            node2 = ancestor
            node1 = ancestor.parent
        node_dist = self.node_distance(node1, node2)
        if distance_fraction:
            if not 0 <= distance <= 1.0:
                raise PhyloValueError("Error: if 'distance_fraction' is True, 'distance' must be a value between 0 and 1.")
            dist = distance * node_dist
        else:
            if distance > node_dist:
                raise PhyloValueError("Error: the given 'distance' is larger than the branch to be rooted ({}).".format(node_dist))
            dist = distance
        self.root_nodes(node1, node2, dist)
    def root_nodes(self, node1, node2, distance):
        """Sets the tree root between TreeNode objects node1 and node2, 'distance' away from node1."""
        if node1 == node2.parent:
            upper_node = node1
            lower_node = node2
            upper_dist, lower_dist = distance, lower_node.branch - distance
        elif node2 == node1.parent:
            upper_node = node2
            lower_node = node1
            upper_dist, lower_dist = lower_node.branch - distance, distance
        else:
            raise PhyloValueError('root_nodes() requires that one of the given nodes is the parent of the other.')
        if len(self.root.children) <= 1:
            raise PhyloValueError('cannot re-root a tree where the existing root has one or no children.')
        elif len(self.root.children) == 2:
            if upper_node == self.root:
                # Just need to adjust branch lengths
                root_child = self.root.children[1] if self.root.children[0] == lower_node else self.root.children[0]
                root_child.branch += upper_dist
                lower_node.branch = lower_dist
            else:
                upper_path = self.find_path_to_root(upper_node)
                # Process the old root child after removing the root:
                root_child = self.root.children[1] if self.root.children[0] == upper_path[1] else self.root.children[0]
                root_child.branch += upper_path[1].branch
                root_child.parent = upper_path[1]
                upper_path[1].children.append(root_child)
                # Process nodes between root and upper_node:
                prev_node = upper_path[1]
                for next_node in upper_path[2:]:
                    prev_node.children.remove(next_node)
                    prev_node.parent = next_node
                    next_node.children.append(prev_node)
                    prev_node.branch = next_node.branch
                    prev_node = next_node
                # Process upper_node, lower_node, and the new root
                upper_node.parent = lower_node.parent = self.root
                upper_node.children.remove(lower_node)
                self.root.children = [node1, node2] # Keeps the argument order
                upper_node.branch = upper_dist
                lower_node.branch = lower_dist
        else: # If the root has 3 children it means it's an unrooted tree
            new_root = self.new_tree_node()
            new_root.branch = self.root.branch # Transfers any existing root branch
            if upper_node != self.root:
                upper_path = self.find_path_to_root(upper_node)
                prev_node = self.root
                for next_node in upper_path[1:]:
                    prev_node.children.remove(next_node)
                    prev_node.parent = next_node
                    next_node.children.append(prev_node)
                    prev_node.branch = next_node.branch
                    prev_node = next_node
            upper_node.children.remove(lower_node)
            upper_node.branch = upper_dist
            lower_node.branch = lower_dist
            new_root.children.append(upper_node)
            new_root.children.append(lower_node)
            upper_node.parent = lower_node.parent = new_root
            self.root = new_root
        self.process_tree_nodes()

    # # #  Functions to extract information
    def get_named_leaves(self):
        """Returns a sorted list of strings."""
        names = [node.name for node in self.leaves]
        return sorted(names)
    def get_named_children(self):
        """Returns a dict {'name':['child1', 'child2', ...], ...}."""
        node_children = {}
        for node in self.nodes:
            node_children[node.name] = [c.name for c in node.children]
        return node_children
    def get_named_paths(self):
        """Returns a dict {'name1':['root','node1','node2','name1'], ...}."""
        named_paths = {}
        for node in self.nodes:
            named_paths[node.name] = [n.name for n in self.paths[node]]
        return named_paths
    def get_distance_matrix(self):
        """Returns a sorted list of strings, and a 2D Numpy array. The phylogenetic distance between tree leaves i and j from 'names' is found by 'dist_mat[i,j]'."""
        names = self.get_named_leaves()
        num_names = len(names)
        dist_mat = np.zeros((num_names, num_names) ,dtype='float')
        for i, j in itertools.combinations(range(num_names), 2):
            node1, node2 = self.node_names[names[i]], self.node_names[names[j]]
            dist = self.node_distance(node1, node2)
            dist_mat[i,j] = dist
            dist_mat[j,i] = dist
        return names, dist_mat
    def get_leaf_coordinate_points(self, max_dimensions=None):
        """Returns a sorted list of strings, and a 2D Numpy array. The coordinates for tree leaf i are found by 'coords[i]'.
        If 'max_dimensions' is specified, the least significant dimensions will be discarded.
        The algorithm was found at http://math.stackexchange.com/questions/156161/finding-the-coordinates-of-points-from-distance-matrix/423898#423898"""
        names, dist_mat = self.get_distance_matrix()
        num_leaves = len(names)
        sqrd_dist = np.square(dist_mat)
        # Generate the positive semi-definite square matrix M:
        m_mat = np.zeros((num_leaves, num_leaves), dtype='float')
        for i in range(num_leaves):
            di1 = sqrd_dist[0,i]
            for j in range(i, num_leaves):
                m = di1 + sqrd_dist[0,j] - sqrd_dist[i,j]
                m_mat[i,j] = m
                m_mat[j,i] = m
        m_mat /= 2.0
        # An eigenvalue decomposition of M yields the coordinate points:
        values, vectors = np.linalg.eigh(m_mat)
        tokeep = max(len(values) - max_dimensions, 0) if max_dimensions else 0
        values, vectors = values[tokeep:], vectors[:,range(tokeep, len(values))]
        coords = np.column_stack(vectors[:,i]*np.sqrt(val) for i, val in enumerate(values) if val > 1e-5)
        return names, coords

    # # #  Newick parsing and saving functions
    def parse_newick(self, newick_str, internal_as_names=False):
        self.reset_node_ids()
        try:
            newick_str = self.clean_newick_string(newick_str)
            final_r = newick_str.rfind(')')
            self.root = self.new_tree_node()
            name, comment, branch, support = self.parse_newick_node_data(newick_str[final_r+1 : -1])
            self.newick_info_to_node(self.root, name, branch, support, comment, internal_as_names)
            i, r_prev, parent_nodes = newick_str.find('('), False, [self.root]
            while i < len(newick_str):
                lj, rj, cj, lsq, rsq = (newick_str.find(c, i+1) for c in '(),[]')
                # Parses nested comments:
                sub_lsq = newick_str.find('[', lsq+1)
                while -1 < sub_lsq < rsq:
                    sub_lsq = newick_str.find('[', sub_lsq+1)
                    rsq = newick_str.find(']', rsq+1)
                # Ensures the found (), are not within a comment:
                if lsq < lj < rsq:
                    lj = newick_str.find('(', rsq+1)
                if lsq < rj < rsq:
                    rj = newick_str.find(')', rsq+1)
                if lsq < cj < rsq:
                    cj = newick_str.find(',', rsq+1)
                # The closest (), identifies what action to take:
                j = min(ind for ind in (lj,rj,cj) if ind > 0)
                if lj == j: # new internal node.
                    parent_nodes.append( self.new_tree_node(parent_nodes[-1]) )
                else: # process node
                    name, comment, branch, support = self.parse_newick_node_data(newick_str[i+1:j])
                    if r_prev: # complete latest internal node.
                        node = parent_nodes.pop()
                        is_leaf = False
                    else: # new leaf node.
                        node = self.new_tree_node(parent_nodes[-1])
                        is_leaf = True
                    self.newick_info_to_node(node, name, branch, support, comment, internal_as_names, is_leaf)
                    parent_nodes[-1].children.append(node)
                if j == final_r:
                    break
                r_prev = True if rj == j else False
                i = j
        except:
            raise PhyloValueError('Error: malformed Newick data.')
        self.process_tree_nodes()
    def save_newick(self, filename, support_values=True, comments=True, internal_names=False, support_as_comment=False):
        newick_str = self.newick_string(support_values, comments, internal_names, support_as_comment)
        with open(filename, 'w') as f:
            f.write(newick_str)
    def newick_string(self, support_values=True, comments=True, internal_names=False, support_as_comment=False):
        if support_values and internal_names:
            support_as_comment = True
        newick_replacements = {'(':'', ')':'', ',':'', ':':'', '[':'', ']':'', ' ':'_', '\t':'', '\n':''}
        replacer_fxn = self.create_string_replacer_function(newick_replacements)
        return self.format_newick_string(self.root, replacer_fxn, support_values, comments, internal_names, support_as_comment) + ';'

    # # #  PhyloXML parsing and saving functions
    def parse_phyloxml(self, phylo_str):
        phylos, ns = self.parse_phyloxml_phylogenies(phylo_str)
        if len(phylos) > 1:
            raise PhyloValueError("Error: multiple phylogenies detected. Use the function 'load_multiple_phyloxml()' instead.")
        else:
            phy = phylos[0]
        self.reset_node_ids()
        self.name = phy.findtext(ns + 'name', None)
        root_e = phy.find(ns + 'clade')
        self.root = self.new_tree_node()
        self.parse_element_info_to_node(self.root, root_e, ns)
        self.traverse_phyloxml(self.root, root_e, ns)
        self.process_tree_nodes()
    def parse_multiple_phyloxml(self, phylo_str):
        phylos, ns = self.parse_phyloxml_phylogenies(phylo_str)
        trees = []
        for phy in phylos:
            self.reset_node_ids()
            root_e = phy.find(ns + 'clade')
            self.root = self.new_tree_node()
            self.parse_element_info_to_node(self.root, root_e, ns)
            self.traverse_phyloxml(self.root, root_e, ns)
            #self.process_tree_nodes() This is done in copy()
            trees.append(self.copy())
        return trees
    def save_phyloxml(self, filename, support_values=True, comments=True, internal_names=False):
        phyloxml_str = self.phyloxml_string(support_values, comments, internal_names)
        with open(filename, 'w') as f:
            f.write(phyloxml_str)
    def phyloxml_string(self, support_values=True, comments=True, internal_names=False):
        e_tree = ET.Element('phyloxml')
        e_tree.set('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
        e_tree.set('xsi:schemaLocation', 'http://www.phyloxml.org http://www.phyloxml.org/1.10/phyloxml.xsd')
        e_tree.set('xmlns', 'http://www.phyloxml.org')
        phylogeny = ET.SubElement(e_tree, 'phylogeny')
        phylogeny.set('rooted', 'true')
        phylogeny.set('rerootable', 'true')
        if self.name:
            name_e = ET.SubElement(phylogeny, 'name')
            name_e.text = self.name
        self.add_nodes_to_phyloxml(self.root, phylogeny, support_values, comments, internal_names)
        return ET.tostring(e_tree, encoding='UTF-8', method='xml').decode()

    # # #  NEXUS parsing and saving functions
    def parse_nexus(self, nexus_str, internal_as_names=False):
        tree_commands, translate_command = self.parse_nexus_tree_commands(nexus_str)
        if len(tree_commands) > 1:
            raise PhyloValueError("Error: multiple trees detected. Use the function 'load_multiple_nexus()' instead.")
        self.reset_node_ids()
        tree_name, _, newick_str = tree_commands[0].partition('=')
        self.name = tree_name.strip()
        self.parse_newick(newick_str.strip() + ';', internal_as_names)
        #self.process_tree_nodes() #This is done in parse_newick()
        if translate_command:
            translation = self.format_nexus_translation(translate_command)
            for node in self.nodes:
                if node.name in translation:
                    node.rename(translation[node.name])
    def parse_multiple_nexus(self, nexus_str, internal_as_names=False):
        tree_commands, translate_command = self.parse_nexus_tree_commands(nexus_str)
        trees = []
        for tree_command in tree_commands:
            self.reset_node_ids()
            tree_name, _, newick_str = tree_command.partition('=')
            self.name = tree_name.strip()
            self.parse_newick(newick_str.strip() + ';', internal_as_names)
            #self.process_tree_nodes() #This is done in parse_newick()
            if translate_command:
                translation = self.format_nexus_translation(translate_command)
                for node in self.nodes:
                    if node.name in translation:
                        node.rename(translation[node.name])
            trees.append(self.copy())
        return trees
    def save_nexus(self, filename, translate_command=False, support_values=True, comments=True, internal_names=False, support_as_comment=False):
        nexus_str = self.nexus_string(translate_command, support_values, comments, internal_names, support_as_comment)
        with open(filename, 'w') as f:
            f.write(nexus_str)
    def nexus_string(self, translate_command=False, support_values=True, comments=True, internal_names=False, support_as_comment=False):
        indent = '    '
        nexus_buff = ['#NEXUS', '', 'BEGIN TREES;']
        if translate_command:
            trans_str, trans_dict = self.nexus_translate_string_dict(indent, internal_names)
            for cur_name, new_name in trans_dict.items():
                self.node_names[cur_name].rename(new_name)
            nexus_buff.append(trans_str)
        newick_str = self.newick_string(support_values, comments, internal_names, support_as_comment)
        tree_name = self.name if self.name else 'tree'
        nexus_buff.append('{}Tree {} = {}'.format(indent, tree_name, newick_str))
        nexus_buff.append('END;')
        return '\n'.join(nexus_buff)

    # # #  Misc rooting functions
    def find_middle_point(self):
        """Identifies leaf1 and leaf2, which are the furthest apart in the tree. Pairwise distances aren't needed, as this pair must proveably include leaf1, which is the leaf furthest from the root.
        """
        leaf1, longest_dist = None, 0.0
        for leaf in self.leaves:
            dist = sum(self.path_dists[leaf])
            if dist > longest_dist:
                leaf1 = leaf
                longest_dist = dist
        leaf2, longest_dist = None, 0.0
        for leaf in self.leaves:
            dist = self.node_distance(leaf1, leaf)
            if dist > longest_dist:
                leaf2 = leaf
                longest_dist = dist
        for ind, (n1, n2) in enumerate(zip(self.paths[leaf1], self.paths[leaf2])):
            if n1 != n2:
                break
        rev_ind = ind - len(self.paths[leaf1]) - 1
        nodes = self.paths[leaf1][-1:rev_ind-1:-1] + self.paths[leaf2][ind:]
        dists = self.path_dists[leaf1][-1:rev_ind:-1] + self.path_dists[leaf2][ind:]
        mid_dist, cur_dist = longest_dist / 2.0, 0.0
        for i in range(len(nodes)-1):
            dist = dists[i]
            if cur_dist + dist >= mid_dist:
                node1, node2 = nodes[i], nodes[i+1]
                if cur_dist + dist == mid_dist:
                    distance = dist
                else:
                    distance = mid_dist - cur_dist
                break
            else:
                cur_dist += dist
        return node1, node2, distance

    # # #  Misc newick parsing and saving functions
    def clean_newick_string(self, newick_str):
        """Removes whitespace, but only outside of comments."""
        str_buff = []
        for data in self.separate_square_comments(newick_str):
            if data[0] != '[':
                str_buff.extend(data.split())
            else:
                str_buff.append(data)
        return ''.join(str_buff).strip()
    def parse_newick_node_data(self, data):
        # If [] is at the end of a branch, it is a support value. If [] is at the end of a name, it is a comment. 'data' is a string with layout 'name[comment]:branch[support]', where all 4 parts are optional.
        if not data:
            return '', '', '', ''
        name, comment, branch, support = '', '', '', ''
        segs = self.separate_square_comments(data)
        if len(segs) == 4:
            if segs[0][0] != '[' and segs[1][0] == '[' and segs[2][0] == ':' and segs[3][0] == '[':
                name, comment, branch, support = segs
            else:
                raise PhyloValueError('Error: malformed Newick data.')
        elif len(segs) == 3:
            if segs[0][0] != '[' and segs[1][0] == '[' and segs[2][0] == ':':
                name, comment, branch = segs
            elif segs[0][0] == '[' and segs[1][0] == ':' and segs[2][0] == '[':
                comment, branch, support = segs
            else:
                raise PhyloValueError('Error: malformed Newick data.')
        elif len(segs) == 2:
            if ':' in segs[0] and segs[1][0] == '[':
                name_branch, support = segs
                name, _, branch = name_branch.partition(':')
            elif segs[0][0] != '[' and segs[1][0] == '[':
                name, comment = segs
            elif segs[0][0] == '[' and segs[1][0] == ':':
                comment, branch = segs
            else:
                raise PhyloValueError('Error: malformed Newick data.')
        elif len(segs) == 1:
            if segs[0][0] == '[':
                comment = segs[0]
            else:
                name, _, branch = segs[0].partition(':')
        else:
            raise PhyloValueError('Error: malformed Newick data.')
        if ':' in branch:
            branch = branch[1:]
        support, comment = support[1:-1], comment[1:-1] # Removes []
        return name.strip(), comment.strip(), branch.strip(), support.strip()
    def newick_info_to_node(self, node, name, branch, support, comment, internal_as_names, is_leaf=False):
        if not is_leaf and name and not support and internal_as_names == False:
            try:
                support = float(name)
                name = ''
            except ValueError:
                pass
        node.name = name
        node.branch = branch
        if support:
            node.support = support
        if comment:
            node.comment = comment
    def format_newick_string(self, node, replacer_fxn, support_values, comments, internal_names, support_as_comment):
        name = replacer_fxn(node.name if node.name != node.id else '')
        comment = '[{}]'.format(node.comment) if node.comment else ''
        if node in self.leaves:
            if comments:
                name += comment
            if self._is_cladogram:
                return name
            else:
                return '{}:{}'.format(name, self.format_branch(node.branch))
        else:
            children_buff = ['(', ','.join(self.format_newick_string(child, replacer_fxn, support_values, comments, internal_names, support_as_comment) for child in node.children), ')']
            if support_as_comment:
                if internal_names and name:
                    children_buff.append(name)
                if comments:
                    children_buff.append(comment)
                if not self._is_cladogram and (node!=self.root or node.branch!=0):
                    children_buff.append(':' + self.format_branch(node.branch))
                if node.support != None:
                    children_buff.append('[{}]'.format(node.support))
            else:
                if support_values and node.support != None:
                    children_buff.append(str(node.support))
                elif internal_names and name:
                    children_buff.append(name)
                if comments:
                    children_buff.append(comment)
                if not self._is_cladogram and (node!=self.root or node.branch!=0):
                    children_buff.append(':' + self.format_branch(node.branch))
            return ''.join(children_buff)

    # # #  Misc phyloxml parsing and saving functions
    def parse_phyloxml_phylogenies(self, phylo_str):
        try:
            ET_root = ET.fromstring(phylo_str.strip())
        except:
            raise PhyloValueError("Error: malformed PhyloXML file.")
        if 'phyloxml' not in ET_root.tag:
            raise PhyloValueError("Error: malformed file format. The first element of a PhyloXML file must have the tag 'phyloxml'.")
        ns, _, _ = ET_root.tag.rpartition('phyloxml')
        phylos = ET_root.findall(ns + 'phylogeny')
        if len(phylos) == 0:
            raise PhyloValueError("Error: malformed file format. No phylogenies were found.")
        return phylos, ns
    def traverse_phyloxml(self, node, element, ns):
        for child_element in element.findall(ns + 'clade'):
            child_node = self.new_tree_node(node)
            self.parse_element_info_to_node(child_node, child_element, ns)
            node.children.append(child_node)
            self.traverse_phyloxml(child_node, child_element, ns)
    def parse_element_info_to_node(self, node, element, ns):
        seq_element = element.find(ns + 'sequence')
        name = element.findtext(ns + 'name', None)
        if not name:
            if seq_element is not None:
                name = seq_element.findtext(ns + 'name', None)
        node.name = name
        branch = element.findtext(ns + 'branch_length', None)
        if branch == None:
            branch = element.get('branch_length')
        node.branch = branch
        confidence = element.find(ns + 'confidence')
        if confidence is not None:
            node.support = confidence.text
            con_type = confidence.get('type')
            if con_type:
                node.support_type = con_type
        prop_e = element.find(ns + 'property')
        if prop_e is not None:
            if prop_e.get('applies_to') == 'clade' and prop_e.get('ref') == 'comment':
                node.comment = prop_e.text
    def add_nodes_to_phyloxml(self, node, parent_element, support_values, comments, internal_names):
        element = ET.SubElement(parent_element, 'clade')
        name = '' if node.name == node.id else node.name
        if name and (node in self.leaves or internal_names):
            name_e = ET.Element('name')
            name_e.text = name
            element.append(name_e)
        if not self._is_cladogram:
            branch_e = ET.Element('branch_length')
            branch_e.text = self.format_branch(node.branch)
            element.append(branch_e)
        if support_values and node.support is not None and node.support_type:
            conf_e = ET.Element('confidence', attrib={'type':node.support_type})
            conf_e.text = str(node.support)
            element.append(conf_e)
        if comments and node.comment:
            prop_e = ET.Element('property', attrib={'applies_to':'clade', 'datatype':'xsd:string', 'ref':'comment'})
            prop_e.text = str(node.comment)
            element.append(prop_e)
        for child in node.children:
            self.add_nodes_to_phyloxml(child, element, support_values, comments, internal_names)

    # # #  Misc NEXUS parsing and saving functions
    def parse_nexus_blocks(self, nexus_str):
        nexus_str = nexus_str.strip()
        if nexus_str[:7].lower() != '#nexus\n':
            raise PhyloValueError("Error: malformed NEXUS file.")
        nexus_lines = [] # Ensures the only ; are outside of comments
        for data_str in self.separate_square_comments(nexus_str[7:]):
            if not data_str:
                continue
            elif data_str[0] == '[':
                nexus_lines.append(data_str.replace(';','.'))
            else:
                nexus_lines.append(data_str)
        nexus_lines = ''.join(nexus_lines).split(';')
        blocks, block = OrderedDict(), None
        commands = []
        for line in nexus_lines:
            line = line.strip()
            if not line:
                continue
            cmds = self.separate_square_comments(line)
            for cmd_ind, cmd in enumerate(cmds):
                if cmd[0] != '[':
                    break
            else:
                raise PhyloValueError("Error: malformed NEXUS file. No valid command found within line '{}'.".format(line))
            cmd_line = ''.join(cmds[cmd_ind :]).strip()
            if cmd_line.lower().startswith('begin '):
                block = cmd_line[6:].lower().strip()
                if block in blocks:
                    raise PhyloValueError("Error: the NEXUS file contains multiple '{}' blocks.".format(block))
                commands = []
            elif cmd_line.lower() == 'end':
                blocks[block] = commands
                block, commands = None, []
            elif block is not None:
                command, _, data = cmd_line.strip().partition(' ')
                commands.append((command.lower().strip(), data))
            else:
                pass
        if block is not None:
            raise PhyloValueError("Error: malformed NEXUS file. The final block had no end.")
        return blocks
    def parse_nexus_tree_commands(self, nexus_str):
        tree_commands, translate_command = [], None
        blocks = self.parse_nexus_blocks(nexus_str)
        trees_block = blocks.get('trees', None)
        if trees_block == None:
            raise PhyloValueError('Error: no TREES block in the given NEXUS file.')
        for cmd, data in trees_block:
            if cmd == 'translate':
                translate_command = data
            elif cmd == 'tree':
                tree_commands.append(data)
        if not tree_commands:
            raise PhyloValueError('Error: no trees found in the given NEXUS file.')
        return tree_commands, translate_command
    def format_nexus_translation(self, translate_command):
        trans = {}
        for entry in translate_command.split(','):
            name1, _, name2 = entry.strip().partition(' ')
            trans[name1] = name2
        return trans
    def nexus_translate_string_dict(self, indent, internal_names=False):
        trans_buff, trans_dict = [], {}
        to_translate = self.nodes if internal_names else self.leaves
        for ind, node in enumerate(to_translate):
            trans_buff.append('{}{} {}'.format(indent, ind+1, node.name))
            trans_dict[node.name] = str(ind+1)
        trans_str = '{}Translate\n{};'.format(indent, ',\n'.join(trans_buff))
        return trans_str, trans_dict

    # # #  Misc tree parsing functions
    def reset_node_ids(self):
        self.nodes = set()
        self._node_ids = set()
        self._node_id_index = 0
    def new_tree_node(self, parent=None, node_id=None):
        if node_id == None:
            node_id = self._node_id_template.format(self._node_id_index)
        while node_id in self._node_ids:
            self._node_id_index += 1
            node_id = self._node_id_template.format(self._node_id_index)
        self._node_ids.add(node_id)
        self._node_id_index += 1
        node = TreeNode(self, node_id, parent)
        self.nodes.add(node)
        return node
    def separate_square_comments(self, data_str):
        """Given a string, separates it into data and comments.
        Ex: 'some_data[a comment] data [now [a nested] comment]end' becomes ['some_data', '[a comment]', ' data ', '[now [a nested] comment]', 'end']."""
        data_buff = []
        lsq, rsq = data_str.find('['), -1
        while lsq > -1:
            if lsq != 0:
                data_buff.append(data_str[rsq+1:lsq])
            rsq = data_str.find(']', lsq+1)
            sub_lsq = data_str.find('[', lsq+1)
            while -1 < sub_lsq < rsq:
                sub_lsq = data_str.find('[', sub_lsq+1)
                rsq = data_str.find(']', rsq+1)
            if rsq == -1:
                raise PhyloValueError("Error: mismatched square brackets: '{}'. Cannot extract comments.".format(data_str))
            data_buff.append(data_str[lsq:rsq+1])
            lsq = data_str.find('[', rsq+1)
        if rsq < len(data_str) - 1:
            data_buff.append(data_str[rsq+1 :])
        return data_buff
    def process_tree_nodes(self):
        """Cleans up the node names, differentiating between internal names and support values. Ensures all nodes have a numerical node.branch value. Sets self._is_cladogram. Fills out the self.leaves and self.internal sets."""
        self.leaves, self.internal = set(), set()
        _is_cladogram = True
        for node in self.nodes:
            if not node._been_processed:
                if not node.name:
                    node.name = node.id
                elif self._remove_name_quotes and (node.name[0] == node.name[-1] == "'" or node.name[0] == node.name[-1] == '"'):
                    node.name = node.name[1:-1].strip()
                if node.branch != '' and node.branch != None:
                    node.branch = float(node.branch)
                    _is_cladogram = False
                else:
                    node.branch = 0.0
            if not node.children:
                self.leaves.add(node)
            else:
                self.internal.add(node)
                if not node._been_processed and node.support:
                    try:
                        node.support = float(node.support)
                        if not node.support_type:
                            node.support_type = self._support_label
                    except ValueError:
                        if not node.comment:
                            node.comment = node.support
                        node.support = None
        if self._is_cladogram == None:
            self._is_cladogram = _is_cladogram
        self.node_names = {}
        for node in self.nodes:
            if node != self.root:
                if self._is_cladogram:
                    node.branch = self._cladogram_branch
            if node.name in self.node_names:
                i = 2
                name = '{}_{}'.format(node.name, i)
                while name in self.node_names:
                    i += 1
                    name = '{}_{}'.format(node.name, i)
                node.name = name
            self.node_names[node.name] = node
            node._been_processed = True
        self.calculate_paths()
    def calculate_paths(self):
        """Fills out self.paths and self.path_dists."""
        self.paths = {}
        for node in self.nodes:
            path = self.find_path_to_root(node)
            self.paths[node] = path
            self.path_dists[node] = [0.0] + [n.branch for n in path[1:]]
    def find_path_to_root(self, node):
        path = []
        self.traverse_parents_to_root(node, path)
        return path[::-1]
    def traverse_parents_to_root(self, node, path):
        path.append(node)
        if node == self.root:
            return
        else:
            self.traverse_parents_to_root(node.parent, path)

    # # #  Misc functions
    def create_string_replacer_function(self, replacements):
        # Returns a function to be used: new_name = fxn(name)
        pattern = re.compile("|".join([re.escape(k) for k, v in replacements.items()]), re.M)
        replacement_function = lambda match: replacements[match.group(0)]
        return lambda string: pattern.sub(replacement_function, string)
    def format_branch(self, branch):
        if branch == 0:
            return '0'
        elif abs(branch) >= 0.0001:
            return '{:g}'.format(branch)
        else:
            return '{{:.{}f}}'.format(self._max_precision).format(branch)
    def copy_nodes(self, old_parent, new_parent, new_tree):
        new_children = []
        for old_child in old_parent.children:
            new_child = old_child.copy(new_tree)
            new_child.parent = new_parent
            new_children.append(new_child)
            new_tree.nodes.add(new_child)
            self.copy_nodes(old_child, new_child, new_tree)
        new_parent.children = new_children
    def traverse_order_children(self, node, increasing):
        order, total_children = {}, 0
        for child in node.children:
            if child in self.leaves:
                order[child] = (0, child.branch)
                total_children += 1
            else:
                sub_children = self.traverse_order_children(child, increasing)
                order[child] = (sub_children, child.branch)
                total_children += sub_children
        node.children.sort(key=lambda nd: order[nd], reverse=not increasing)
        return total_children
    def __str__(self):
        _str = 'phylo.Tree leaves={}'.format(len(self.leaves))
        if self.name != None:
            _str += ', name={}'.format(self.name)
        return _str
    def __repr__(self):
        return '<phylo.Tree at {}>'.format(hex(id(self)))


class TreeNode(object):
    def __init__(self, tree, node_id, parent):
        self.tree = tree
        self.id = node_id
        self.parent = parent
        self.name = None
        self.branch = None
        self.support = None
        self.support_type = None
        self.comment = None
        self.children = []
        self._been_processed = False
    def rename(self, new_name):
        if new_name in self.tree.node_names:
            raise PhyloValueError("Error: cannot rename node to '{}', as it is not unique.".format(new_name))
        del self.tree.node_names[self.name]
        self.name = new_name
        self.tree.node_names[new_name] = self
    def copy(self, new_tree):
        new_node = new_tree.new_tree_node(parent=self.parent, node_id=self.id)
        new_node.name = self.name
        new_node.branch = self.branch
        new_node.support = self.support
        new_node.support_type = self.support_type
        new_node.comment = self.comment
        new_node.children = self.children
        new_node._been_processed = self._been_processed
        return new_node
    def __str__(self):
        _str = 'phylo.TreeNode id={}'.format(self.id)
        if self.name != self.id:
            _str += ', name={}'.format(self.name)
        return _str
    def __repr__(self):
        return '<phylo.TreeNode id={} at {}>'.format(self.id, hex(id(self)))

# # #  Phylo errors
class PhyloValueError(ValueError):
    def __init__(self, *args, **kwargs):
        ValueError.__init__(self, *args, **kwargs)



# TODO:
# Decide to keep this as a standalone (probably not) or include it as part of molecbio. Regardless, update the import calls in miphy and navargator (and add molecbio as a dependency).

# Probably worth implementing the NeXML format as well. Doesn't look too bad. Can then have a load_xml() function, that picks between PhyloXML or NeXML based on the file itself.
# Check that this can handle phyloxml files with namespaces.
# Implement 'load_tree' and 'load_tree_string' functions. These should look at the first part of the file for identifying data (#NEXUS, the word phyloxml, the word nexml; if none of these default to newick), and call the relevant load function. If it contains multiple trees, the appropriate error should already be thrown.
# If there is some annotation format that major apps use (FigTree, MEGA, etc), would be good to add a function to output that. So I can programatically set node shapes, colours, etc.

if __name__ == '__main__':
    tree = load_newick('test_tree.nwk')
    #tree = load_newick('hayden_OR213.noPgi.nwk')
    #tree = load_phyloxml('PhyloXML_example.xml')
    #tree = load_phyloxml('h3n2.xml')
    #tree = load_nexus('hayden.nxs')
    #tree = load_nexus('test_tree5.nxs')

    #trees = [load_newick('test_tree.nwk'), load_newick('test_tree2.nwk'), load_newick('test_tree3.nwk')]
    #trees = load_multiple_phyloxml('multi_test.xml')
    #trees = load_multiple_nexus('test_tree5.nxs')

    #for node in tree.nodes:
    #    print node.name, [n.name for n in node.children], node.support
    #for tree in trees:
    #    print tree
    #    for node in tree.nodes:
    #        print node.name, [n.name for n in node.children]

    #tree.root_midpoint()
    #tree.root_outgroup([])
    #tree.balance_negative_branches()
    #tree.reorder_children()

    #print tree.get_named_paths()


    #tree.save_newick('test_tree5.nwk')
    #tree.save_phyloxml('example_rooted.xml')
    #tree.save_phyloxml('test_tree.xml')
    #tree.save_newick('phylo_example.nwk', comments=False, support_as_comment=False)
    #tree.save_nexus('test_tree.nxs', comments=False)
    #tree.save_nexus('hayden.nxs', comments=False)
    #save_multiple_phyloxml(trees, 'multi_test.xml')
    #save_multiple_nexus(trees, 'multi_tree.nxs', translate_command=False)
