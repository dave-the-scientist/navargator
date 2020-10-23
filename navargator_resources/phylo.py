"""A module containing the Tree and TreeNode class definitions, and functionality to parse, manipulate, and save phylogenetic trees in Newick, NEXUS, PhyloXML, or NeXML formats.

Input/Output
============
- Trees can be loaded from files or from strings, and the functions follow the naming conventions load_FORMAT(tree_filename) and load_FORMAT_string(tree_string); both return a Tree instance. For file formats that support multiple trees, there are also load_multiple_FORMAT(tree_filename) and load_multiple_FORMAT_string(tree_string); both return a list of Tree instances. Some loading functions have specific arguments, but all respect the tree_args: support_label='bootstrap', remove_name_quotes=True. 'support_label' specifies the default type of branch support values, if any; this will be used unless one is specified in the formats that allow it (PhyloXML and NeXML). 'remove_name_quotes' will remove ' or " quotation marks surrounding the names of tree nodes, if present; some popular tree viewing programs add them.
- Saving methods are called on Tree instances, and follow the naming conventions Tree.save_FORMAT(tree_filename) and Tree.FORMAT_string(); save_FORMAT writes to a file and returns None, while FORMAT_string returns the tree data as a string. There are also functions to save multiple trees to a supporting file format - note that these are module functions and so are not called on Tree instances - that follow the naming conventions save_multiple_FORMAT(trees, tree_filename) and multiple_FORMAT_string(trees); both expect 'trees' to be a list of Tree instances. All saving functions respect the save_args: support_values=True, comments=True, internal_names=True, max_name_length=None. The first two specify whether support values or comments, if present, should be saved; 'internal_names' indicates whether the names of internal nodes should be saved, if present; if 'max_name_length' is an integer it will truncate leaf names to a maximum of 'max_name_length' characters, if it is None no truncations will occur.

Tree loading functions
----------------------
load_tree(tree_filename, internal_as_names=False, **tree_args)
load_tree_string(tree_string, internal_as_names=False, **tree_args)
  - These functions attempt to identify the format of the tree file or string, call the appropriate loading function, and return a Tree instance. 'internal_as_names' will only be respected for Newick and NEXUS trees.
load_newick(tree_filename, internal_as_names=False, **tree_args)
load_newick_string(tree_string, internal_as_names=False, **tree_args)
  - These functions return a Tree instance. 'internal_as_names' should be set to True if the tree has internal nodes that are named, some of those names are purely numeric, and have no support values. Otherwise, those numerical internal names will be interpreted as support values. Comments (encased in []) can be part of the 'label' and/or 'branch' data of a node in the file. They can contain the forbidden characters '(),:;', and can be nested. If part of the 'label' data, it will always be interpreted as a text comment. If part of the 'branch' data it will be interpreted as a support value if it's numeric, as a text comment if there was no 'label' comment, or discarded if there was.
load_nexus(tree_filename, internal_as_names=False, **tree_args)
load_nexus_string(tree_string, internal_as_names=False, **tree_args)
  - These functions return a Tree instance. As the TREES block of a NEXUS file contains data in Newick format, the same considerations described for the Newick functions apply here. Additionally, 'internal_as_names' should be set to True if a Translate command is present in the TREES block, if the translation uses numeric placeholders (they usually do), and if the tree has named internal nodes and no support values.
load_phyloxml(tree_filename, **tree_args)
load_phyloxml_string(tree_string, **tree_args)
  - These functions return a Tree instance. Comments in the file are expected to be children of a clade element, of the form: <property applies_to="clade" datatype="xsd:string" ref="comment">COMMENT</property>.
load_nexml(tree_filename, **kwargs)
load_nexml_string(tree_string, **kwargs)
  - These functions return a Tree instance. Support values in the file are expected to be a child of a node element, of the form: <meta content="SUPPORT_VALUE" datatype="string" id="SOME_ID" property="nex:confidence_TYPE" xsi:type="nex:LiteralMeta" />. The property must begin with "nex:confidence_", and will set the node's support to SUPPORT_VALUE and the support_type to TYPE. If the property contains anything else, the content attribute will be saved as a comment instead.

Loading functions for multiple trees
------------------------------------
load_multiple_nexus(tree_filename, internal_as_names=False, **tree_args)
load_multiple_nexus_string(tree_string, internal_as_names=False, **tree_args)
load_multiple_phyloxml(tree_filename, **tree_args)
load_multiple_phyloxml_string(tree_string, **tree_args)
load_multiple_nexml(tree_filename, **tree_args)
load_multiple_nexml_string(tree_string, **tree_args)
  - These functions return a list of Tree instances. Otherwise, the same considerations described for the standard loading functions apply.

Saving methods for Tree objects
-------------------------------
Tree.save_newick(tree_filename, support_as_comment=False, **save_args)
Tree.newick_string(support_as_comment=False, **save_args)
  - These functions save the tree data to a file or return it as a string, respectively. Support values can be saved as a node label, or as a comment on the branch length of the node. The former is much more common, but the latter is more correct. Setting 'support_as_comment' to True will save any support values as branch comments; this will also be done if support_values=True and internal_names=True and there are named internal nodes. Node names have several character restrictions: any of '()[],:' or newlines will be removed, ';' will be replaced by '.', and spaces and tabs will be replaced by '_'. Comments only have the restriction that any '[]' are correctly paired, even if they are nested.
Tree.save_nexus(tree_filename, translate_command=False, support_as_comment=False, **save_args)
Tree.nexus_string(translate_command=False, support_as_comment=False, **save_args)
  - These functions save the tree data to a file or return it as a string, respectively. NEXUS trees can have node names replaced by small tokens in the data, which can reduce the file size a little in files with multiple trees. Set 'translate_command' to True to activate this. The 'support_as_comment' argument behaves as described for the Newick saving methods. Trees in a NEXUS file must be named, so a default name will be used if the Tree.name attribute is not set or a name was not given in the input file. Node names and comments share the same restrictions as with Newick trees, and as well the tree name is restricted such that any '=' or newlines will be removed, '[]' will be replaced by '()', ';' will be replaced by '.', and any spaces or tabs will be replaced by '_'.
Tree.save_phyloxml(tree_filename, **save_args)
Tree.phyloxml_string(**save_args)
  - These functions save the tree data to a file or return it as a string, respectively. This format supports a name for the tree, but it is not required; use the Tree.name attribute to set it. The tree name, node names, and node comments will have any '<>' characters removed.
Tree.save_nexml(tree_filename, **save_args)
Tree.nexml_string(**save_args)
  - These functions save the tree data to a file or return it as a string, respectively. This format requires a tree name; a default name will be generated if the Tree.attribute is not set or a name was not given in the input file. The tree name, node names, and node comments will have any '<>' characters removed.

Saving functions for multiple trees
-----------------------------------
save_multiple_nexus(trees, tree_filename, translate_command=False, support_as_comment=False, **save_args)
multiple_nexus_string(trees, translate_command=False, support_as_comment=False, **save_args)
save_multiple_phyloxml(trees, tree_filename, **save_args)
multiple_phyloxml_string(trees, **save_args)
save_multiple_nexml(trees, tree_filename, **save_args)
multiple_nexml_string(trees, **save_args)
  - These functions expect 'trees' to be a sequence of Tree instances, and will either save the data to the file 'tree_filename' or return it as a string. NEXUS and NeXML formats require names for each tree, and that each name is unique; default names will be generated if none are set with the Tree.name attribute. The PhyloXML format supports names for trees, but they are not required nor are they required to be unique. Otherwise, the same considerations described for the standard saving functions apply.


Tree manipulation and analysis methods
======================================

Tree rooting methods
--------------------
Tree.root_midpoint()
  - This method re-roots the tree, placing it half-way between the two leaves that are futhest apart. In the absence of a known outgroup, this is usually a good way to root a tree.
Tree.root_outgroup(outgroup, distance=0.5, distance_proportion=True)
  - This method re-roots the tree using the specified outgroup, where 'outgroup' should be a sequence of strings of node names. The root will be placed between the most recent common ancestor of 'outgroup' and its sibling. If 'distance_proportion' is True, the root will be placed 'distance' of the way between the two nodes (distance=0.25 means the root will be placed 25% of the distance between the outgroup ancestor and its sibling). If 'distance_proportion' is False, the root will be placed at a phylogenetic distance of 'distance' away from the outgroup ancestor.
  - Importantly, if the most recent common ancestor of the outgroup in the current tree representation is not the root, then 'outgroup' only needs to contain as few as 2 names with that same recent common ancestor. If the most recent common ancestor of the outgroup is the current root, then 'outgroup' must include the name of every leaf in the outgroup.
Tree.root_nodes(node1, node2, distance)
  - This method re-roots the tree, placing it between the given nodes. 'node1' and 'node2' must be TreeNode objects, where one is the direct parent of the other, and the root will be placed at a phylogenetic distance of 'distance' from 'node1'.

Tree modification methods
-------------------------
Tree.reorder_children(increasing=True)
  - This method reorders each node's children for asthetic purposes and ease of viewing. If increasing=True, children are ordered so that short leaves come before leaves with long branches, which come before children that are internal nodes. Setting increasing=False reverses this. Note that most phylogenetic tree viewing software respects the given order of children, but not all.
Tree.prune_to(names, merge_monotomies=True)
Tree.prune_to_nodes(nodes, merge_monotomies=True)
  - These methods modify the tree in place, keeping the designated nodes and their relevant predecessors but pruning off all others. Nodes of interest can be passed directly to Tree.prune_to_nodes(nodes), or they can be designated with a list of their names to Tree.prune_to(names). If the tree is expected to be bifurcating 'merge_monotomies' should remain True. When a node is pruned, that node's sibling will be the only remaining child of the parental node. When 'merge_monotomies' is True the parental node is also removed (unless it is designated to be kept by being a part of 'names' or 'nodes'), and the sibling is connected directly to its grandparental node while retaining the original overall branch lengths. Set it to False if those monotomies should be retained.
  - Note that the Tree.get_nodes_starting_with(prefixes) method may be useful here to generate a list of nodes that all begin with one or more prefixes. This can be helpful when pruning trees that contain nodes with the same or similar names, or to capture various levels of taxonomy in a tree of life.
Tree.replace_in_names(replacements, ignore_case=False)
  - This method modifies the names of all nodes in the tree. 'replacements' must be a dictionary={'pattern1':'new_text1', 'pattern2':'new_text2', ...}, that will replace the given 'pattern' substrings with their respective replacements in a single pass. For example, to remove all '&' characters, replace all spaces with underscores, and simplify a species designation, 'replacements' would be {'&':'', ' ':'_', 'C.elegans':'cel'}. If 'ignore_case' is True, patterns will match to substrings regardless of their case (upper, lower, or mixed). If 'ignore_case' is False, only substrings that exactly match the pattern will be replaced. In either case, the case of the new_text will not be altered.
Tree.set_support_type(support_type)
  - This method allows the type of support value to be set to the given string (eg 'bootstrap' or 'SH value'). This is saved in some formats (PhyloXML and NeXML) but ignored in others (Newick, NEXUS).
Tree.clear_supports(value, relation='<')
  - This method removes all support values in the tree that are less than the given 'value'. This can be modified by setting the 'relation' argument to one of: '<', '<=', '>', '>=', '=', '=='.
Tree.clear_negative_branches(new_value=0.0)
  - This method modifies all nodes with negative branch lengths, setting their branches to the value of 'new_value'.
Tree.balance_negative_branches(new_value=0.0)
  - This method modifies all nodes with negative branch lengths, attempting to set their branches to the value of 'new_value', while removing that same distance from the node's siblings. If the siblings' branches are not long enough to account for the magnitude of the negative branch, a warning will be printed and no branches will be modified. This method is a slightly better way to remove negative branches, as it keeps the distance constant between the modified node and its siblings.
Tree.set_cladogram(cladogram_branch=1.0)
  - This method sets the tree to be a cladogram, so no branch lengths will be saved. 'cladogram_branch' can be used to set the default branch length which used for some internal calculations; the value should not have any effect for the user.

Methods to extract tree information
-----------------------------------
Tree.get_named_leaves()
  - This method returns the names of the leaves as a list of strings, sorted alphabetically.
Tree.get_ordered_names()
  - This method returns the names of the leaves as a list of strings, in the order present in the tree file.
Tree.get_node(name, prevent_error=False)
  - This method returns the TreeNode object named 'name'. An error will be raised if no node matches the given string, unless 'prevent_error'=True, which will cause the function to return None instead. Mappings from node names to their TreeNode objects may also be accessed through the Tree.node_names dictionary object. If the Tree instance was created with the default argument remove_name_quotes=True, the given name will also have its containing quotes removed, if present.
Tree.get_nodes(names)
  - This method takes a sequence of node names as strings, and returns the corresponding list of TreeNode objects. A warning will be printed for any names that do not match a TreeNode object, but nothing will be added to the returned list; a consequence is that an empty list will be returned if no names match.
Tree.get_nodes_starting_with(prefixes)
  - This method takes a sequence of node name prefixes as strings, and returns a list of all TreeNode objects whose name begins with at least one of those prefixes.
Tree.get_ordered_nodes()
  - This method returns all nodes as an ordered list of TreeNode objects. It starts with the root, then its first child, then that child's first child, and so on in a depth-first pre-order (NLR) traversal.
Tree.get_node_leaves(node)
  - This method returns a set of TreeNode objects that are the terminal children of the given TreeNode object.
Tree.get_recent_common_ancestor(nodes)
  - This method takes a sequence of TreeNode objects, and returns the most recent commont ancestor TreeNode shared by all.
Tree.get_subtree(names, keep_root_branch=False)
  - This method takes a sequence of node names as strings, and returns a new Tree object of the subtree containing all nodes specified by 'names'. It is not necessary to include all desired node names in 'names' - in fact only one internal node name or two leaf names are required - as the returned Tree will be rooted at the most recent common ancestor of the given names. Normally the branch length of the new root will be discarded, but setting 'keep_root_branch' to True will keep it.
Tree.get_node_subtree(node, keep_root_branch=False)
  - This method takes a TreeNode object 'node', and returns a new Tree object of the subtree rooted at that node. Normally the branch length of the new root will be discarded, but setting 'keep_root_branch' to True will keep it.
Tree.copy()
  - This method returns a deep copy of the current Tree object. The new tree is independent, and so can be modified without affecting the original tree.

Methods for detailed analyses
-----------------------------
Tree.get_named_children()
  - This method returns a dictionary describing the structure of the tree using node names: {'node_name1':['child_name1', 'child_name2'], 'node_name2':[...], ...}.
Tree.get_named_paths()
  - This method returns a dictionary describing the ancestry of all nodes in the tree: {'node_name1':['root_name', 'internal_name1', 'internal_name2', 'node_name1'], 'node_name2':[...], ...}. Each list traces the route through the tree from the root to that particular node.
Tree.node_distance(node1, node2)
  - This method returns as a float the phylogenetic distance between the two nodes, where 'node1' and 'node2' are both TreeNode objects.
Tree.get_distance_matrix()
  - This method returns 'names', 'distance_matrix'; where 'names' contains all tree leaf names as a list of strings (the same as returned by Tree.get_named_leaves()), and 'distance_matrix' is a symmetrical 2D Numpy array. The phylogenetic distance between tree leaves at indices i and j from 'names' is found by 'dist_mat[i,j]'.
Tree.get_leaf_coordinate_points(max_dimensions=None)
  - This method returns 'names', 'coordinate_points'; where 'names' contains all tree leaf names as a list of strings (the same as returned by Tree.get_named_leaves()), and 'coordinate_points' is a 2D numpy array. 'coordinate_points[i]' is a numpy array representing a point in Euclidean space for the tree leaf 'names[i]', such that all points respect the pairwise distances in the tree. The coordinates will use the minimum number of dimensions required to satisfy those distances, though 'max_dimensions' can be used to specify a maxinum number of dimensions. Though the least important dimensions will be discarded first, the agreement between pairwise coordinate distances and tree distances will degrade with every lost dimension.

General notes
-------------
This module expects node names to be unique. If two nodes have the same name, the node that is processed second will have '_2' appended to its name. This may affect the methods that look for nodes by name.

Some functions will print warnings or other information during execution that are designed to be useful for a user working with this module in simple scripts or in the interpreter. To suppress these messages, import this module and then set 'phylo.verbose' to False.
"""

# Developer notes:
# All parsing functions must call self.reset_nodes(), then use self.new_tree_node() to create nodes, and finally set one as self.root.
# All nodes must have their .parent and .children attributes set. All nodes should have their .name, .branch, .support, .support_type, and .comment attributes filled if possible, though all are optional.
# Use remove_tree_node() to remove nodes from the tree.
# self.process_tree_nodes() must be called after adding or removing a batch of nodes.


import re, operator, itertools
import xml.etree.ElementTree as ET
from collections import OrderedDict
import numpy as np

verbose = True

def load_tree(tree_filename, internal_as_names=False, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_tree_string(tree_string, internal_as_names, **kwargs)
def load_tree_string(tree_string, internal_as_names=False, **kwargs):
    tree_init = tree_string.strip()[:60].lower()
    if tree_init[:5].upper() == '#NEXUS':
        return load_nexus_string(tree_string, internal_as_names, **kwargs)
    elif '<phyloxml ' in tree_init or ':phyloxml ' in tree_init:
        return load_phyloxml_string(tree_string, **kwargs)
    elif '<nexml ' in tree_init or ':nexml ' in tree_init:
        return load_nexml_string(tree_string, **kwargs)
    else:
        return load_newick_string(tree_string, internal_as_names, **kwargs)

def load_newick(tree_filename, internal_as_names=False, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_newick_string(tree_string, internal_as_names, **kwargs)
def load_newick_string(tree_string, internal_as_names=False, **kwargs):
    tree = Tree(**kwargs)
    tree.parse_newick(tree_string, internal_as_names)
    return tree

def load_nexus(tree_filename, internal_as_names=False, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_nexus_string(tree_string, internal_as_names, **kwargs)
def load_nexus_string(tree_string, internal_as_names=False, **kwargs):
    tree = Tree(**kwargs)
    tree.parse_nexus(tree_string, internal_as_names)
    return tree
def load_multiple_nexus(tree_filename, internal_as_names=False, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_multiple_nexus_string(tree_string, internal_as_names, **kwargs)
def load_multiple_nexus_string(tree_string, internal_as_names=False, **kwargs):
    tree = Tree(**kwargs)
    return tree.parse_multiple_nexus(tree_string, internal_as_names)
def save_multiple_nexus(trees, tree_filename, translate_command=False, support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=None):
    tree_string = multiple_nexus_string(trees, translate_command, support_as_comment, support_values, comments, internal_names, max_name_length)
    with open(tree_filename, 'w') as f:
        f.write(tree_string)
def multiple_nexus_string(trees, translate_command=False, support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=None):
    indent = '    '
    nexus_buff, tree_names = ['#NEXUS', '', 'BEGIN TREES;'], set()
    if translate_command:
        new_trees, trans_dict, trans_ind = [], {}, 1
        for tree in trees:
            unique_names = set()
            new_tree = tree.copy()
            new_trees.append(new_tree)
            for node in new_tree.nodes:
                if not (node.name != node.id and (node in new_tree.leaves or internal_names)):
                    continue
                old_name = node.name[:max_name_length]
                if old_name in unique_names:
                    raise PhyloUniqueNameError("Error: cannot save tree in NEXUS format. After removing restricted characters and truncating to {} characters, two nodes ended up with the name '{}'".format(max_name_length, old_name))
                else:
                    unique_names.add(old_name)
                if old_name in trans_dict:
                    new_name = trans_dict[old_name]
                else:
                    new_name = str(trans_ind)
                    trans_dict[old_name] = new_name
                    trans_ind += 1
                node.rename(new_name)
        trees = new_trees
        trans_buff = []
        for orig_name in sorted(trans_dict, key=lambda name: int(trans_dict[name])):
            trans_buff.append('{}{} {}'.format(indent, trans_dict[orig_name], orig_name))
        nexus_buff.append('{}Translate\n{};'.format(indent, ',\n'.join(trans_buff)))
    for tree in trees:
        tree_name_ind = 2
        try:
            newick_str = tree.newick_string(support_as_comment, support_values, comments, internal_names, max_name_length)
        except PhyloUniqueNameError as err:
            raise PhyloUniqueNameError(str(err).replace('Newick', 'NEXUS'))
        tree_name = tree.name if tree.name else 'tree'
        if tree_name in tree_names:
            while '{}_{}'.format(tree_name, tree_name_ind) in tree_names:
                tree_name_ind += 1
            tree_name = '{}_{}'.format(tree_name, tree_name_ind)
        tree_names.add(tree_name)
        nexus_buff.append('{}Tree {} = {}'.format(indent, tree_name, newick_str))
    nexus_buff.append('END;')
    return '\n'.join(nexus_buff)

def load_phyloxml(tree_filename, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_phyloxml_string(tree_string, **kwargs)
def load_phyloxml_string(tree_string, **kwargs):
    tree = Tree(**kwargs)
    tree.parse_phyloxml(tree_string)
    return tree
def load_multiple_phyloxml(tree_filename, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_multiple_phyloxml_string(tree_string, **kwargs)
def load_multiple_phyloxml_string(tree_string, **kwargs):
    tree = Tree(**kwargs)
    return tree.parse_multiple_phyloxml(tree_string)
def save_multiple_phyloxml(trees, tree_filename, support_values=True, comments=True, internal_names=True, max_name_length=None):
    tree_string = multiple_phyloxml_string(trees, support_values, comments, internal_names, max_name_length)
    with open(tree_filename, 'w') as f:
        f.write(tree_string)
def multiple_phyloxml_string(trees, support_values=True, comments=True, internal_names=True, max_name_length=None):
    e_tree = ET.Element('phyloxml')
    e_tree.set('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
    e_tree.set('xsi:schemaLocation', 'http://www.phyloxml.org http://www.phyloxml.org/1.10/phyloxml.xsd')
    e_tree.set('xmlns', 'http://www.phyloxml.org')
    replacer_fxn = Tree().create_string_replacer_function(Tree._phyloxml_replacements)
    for tree in trees:
        phylogeny = ET.SubElement(e_tree, 'phylogeny')
        phylogeny.set('rooted', 'true')
        phylogeny.set('rerootable', 'true')
        if tree.name:
            name_e = ET.SubElement(phylogeny, 'name')
            name_e.text = replacer_fxn(tree.name)
        try:
            tree.add_nodes_to_phyloxml(tree.root, phylogeny, replacer_fxn, set(), support_values, comments, internal_names, max_name_length)
        except PhyloUniqueNameError as err:
            raise PhyloUniqueNameError(str(err))
    return ET.tostring(e_tree, encoding='UTF-8', method='xml').decode()

def load_nexml(tree_filename, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_nexml_string(tree_string, **kwargs)
def load_nexml_string(tree_string, **kwargs):
    tree = Tree(**kwargs)
    tree.parse_nexml(tree_string)
    return tree
def load_multiple_nexml(tree_filename, **kwargs):
    with open(tree_filename) as f:
        tree_string = f.read()
    return load_multiple_nexml_string(tree_string, **kwargs)
def load_multiple_nexml_string(tree_string, **kwargs):
    tree = Tree(**kwargs)
    return tree.parse_multiple_nexml(tree_string)
def save_multiple_nexml(trees, tree_filename, support_values=True, comments=True, internal_names=True, max_name_length=None):
    tree_string = multiple_nexml_string(trees, support_values, comments, internal_names, max_name_length)
    with open(tree_filename, 'w') as f:
        f.write(tree_string)
def multiple_nexml_string(trees, support_values=True, comments=True, internal_names=True, max_name_length=None):
    e_tree = ET.Element('nexml')
    e_tree.set('version', '0.9')
    e_tree.set('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
    e_tree.set('xmlns:nex', 'http://www.nexml.org/2009')
    e_tree.set('xmlns', 'http://www.nexml.org/2009')
    e_tree.set('xsi:schemaLocation', 'http://www.nexml.org/2009 http://www.nexml.org/2009/nexml.xsd')
    e_tree.set('generator', 'molecbio.phylo.py')
    replacer_fxn = Tree().create_string_replacer_function(Tree._nexml_replacements)
    all_otus = []
    for tree in trees:
        all_otus.extend([replacer_fxn(node.name)[:max_name_length] for node in tree.nodes if node in tree.leaves or (internal_names and node.name != node.id)])
    all_otus = sorted(set(all_otus))
    otus_id, node_ids = Tree().add_nexml_otus(e_tree, all_otus)
    trees_e = ET.SubElement(e_tree, 'trees')
    trees_e.set('id', 'trees1')
    trees_e.set('otus', otus_id)
    tree_ids = set()
    for tree in trees:
        tree_ids_ind = 2
        tree_id = replacer_fxn(tree.name) if tree.name else 'tree'
        if tree_id in tree_ids:
            while '{}_{}'.format(tree_id, tree_ids_ind) in tree_ids:
                tree_ids_ind += 1
            tree_id = '{}_{}'.format(tree_id, tree_ids_ind)
        tree_ids.add(tree_id)
        tree.add_nexml_nodes_edges(trees_e, tree_id, node_ids, replacer_fxn, support_values, comments, internal_names, max_name_length)
    return ET.tostring(e_tree, encoding='UTF-8', method='xml').decode()


class Tree(object):
    # # #  Restricted character sets
    _newick_replacements = {'(':'', ')':'', ',':'', ':':'', '[':'', ']':'', ';':'.', ' ':'_', '\t':'_', '\n':''} # Applied to node names, not comments
    _nexus_replacements = {'[':'(', ']':')', ';':'.', '=':'', ' ':'_', '\t':'_', '\n':''} # Applied to tree name only
    _phyloxml_replacements = {'<':'', '>':''} # Applied to tree name, node names, and comments
    _nexml_replacements = {'<':'', '>':''} # Applied to tree name, node names, and comments

    def __init__(self, support_label='bootstrap', remove_name_quotes=True):
        """Data structure used to parse and manipulate phylogenetic trees.
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
        self._is_cladogram = None # None means it hasn't been set; will be True or False.
        self._cladogram_branch = 1.0 # length of each branch in a cladogram
        self._remove_name_quotes = remove_name_quotes
        self._support_label = support_label
        self._node_ids = set()
        self._node_id_template = '_node_{}' # Must not invalidate any restricted character set
        self._node_id_index = 0
        self._max_branch_precision = 10

    # # #  Tree rooting functions
    def root_midpoint(self):
        """Identifies the two leaves that are furthest apart in the tree, and roots the tree halfway between them. This is a good way to root a tree if you lack an outgroup."""
        node1, node2, distance = self.find_middle_point()
        self.root_nodes(node1, node2, distance)
    def root_outgroup(self, outgroup, distance=0.5, distance_proportion=True):
        """Re-roots the tree using the specified outgroup.
        'outgroup' should be a sequence of node names, and the root will be placed between the most recent common ancestor of 'outgroup' and its sibling. If 'distance_proportion' is True, the root will be placed 'distance' fraction of the distance between the two nodes (distance=0.25 means the root will be placed 25% of the distance between the outgroup ancestor and its sibling). If 'distance_proportion' is False, the root will be placed 'distance' away from the outgroup ancestor.
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
        if distance_proportion:
            if not 0 <= distance <= 1.0:
                raise PhyloValueError("Error: if 'distance_proportion' is True, 'distance' must be a value between 0 and 1.")
            dist = distance * node_dist
        else:
            if distance > node_dist:
                raise PhyloValueError("Error: the given 'distance' is larger than the branch to be rooted (must be less than or equal to {}).".format(node_dist))
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

    # # #  Public functions
    def reorder_children(self, increasing=True):
        """Reorders each node's children for asthetic purposes.
        If increasing=True, children are ordered so that short leaves come before leaves with long branches, which come before children that are internal nodes. Setting increasing=False reverses this."""
        self.traverse_order_children(self.root, increasing)
    def prune_to(self, names, merge_monotomies=True):
        """Modifies the tree in place, keeping 'names' and relevant predecessors but pruning off all others."""
        self.prune_to_nodes(self.get_nodes(names), merge_monotomies)
    def prune_to_nodes(self, nodes, merge_monotomies=True):
        """Modifies the tree in place, keeping 'nodes' and relevant predecessors but pruning off all others."""
        to_remove = self.leaves - set(nodes)  # This is sufficient to erode all unwanted internal nodes.
        for node in to_remove:
            self.remove_tree_node(node)
            parent = node.parent
            if parent in nodes:
                continue  # Only happens if the user wants to keep an internal node.
            elif merge_monotomies and len(parent.children) == 1:
                sib = parent.children[0]
                if parent != self.root:
                    # node.parent only has 1 child, so it's removed and node's sib is connected to node's grandparent.
                    sib.branch += parent.branch
                    par_index = parent.parent.children.index(parent)
                    parent.parent.children[par_index] = sib
                    sib.parent = parent.parent
                else:
                    # self.root now has only 1 child, so it's replaced by that child.
                    self.root = sib
                    self.root.branch = 0
                self.remove_tree_node(parent, remove_from_parent=False)
        self.process_tree_nodes()
    def replace_in_names(self, replacements, ignore_case=False):
        """Expects 'replacements' to be a dictionary={'pattern':'new_text', ...}, that will replace the string 'pattern' with 'new_text' in a single pass in all node names. 'ignore_case' allows patterns to match regardless of their case."""
        replacer = self.create_string_replacer_function(replacements, ignore_case)
        for node in self.nodes:
            if node.name is not None and node.name != node.id:
                node.rename(replacer(node.name))
    def set_support_type(self, support_type):
        """Allows the type of support to be set. This is saved in some formats (PhyloXML and NeXML) but ignored in others (Newick, NEXUS)."""
        replacer_fxn = self.create_string_replacer_function({' ':'_', '\t':'_', '\n':'', '<':'', '>':''})
        support_type = replacer_fxn(support_type)
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
                    if verbose:
                        print("Warning: could not balance the negative branch of node '{}' as it has no siblings with positive branches.".format(node.name))
                    continue
                neg_delta /= float(len(pos_sibs))
                if abs(neg_delta) > min_pos:
                    if verbose:
                        print("Warning: could not balance the negative branch of node '{}' as its siblings' branches were not long enough to accommodate it.".format(node.name))
                    continue
                for neg in neg_sibs:
                    neg.branch = new_value
                for pos in pos_sibs:
                    pos.branch += neg_delta
        self.process_tree_nodes()
    def set_cladogram(self, cladogram_branch=1.0):
        """Sets the tree to be a cladogram, so no branch lengths will be saved.
        The argument 'cladogram_branch' can be used to set the default length, used for some internal calculations; the value should not have any effect for the user."""
        self._is_cladogram = True
        self._cladogram_branch = cladogram_branch
        for node in self.nodes:
            if node != self.root:
                node.branch = cladogram_branch
        self.root.branch = 0.0

    # # #  Public functions for working with my data structures
    def get_named_leaves(self):
        """Returns the names of the leaves as a list of strings, sorted alphabetically."""
        names = [node.name for node in self.leaves]
        return sorted(names)
    def get_ordered_names(self):
        """Returns the names of the leaves as a list of strings, in the order present in the tree file."""
        nodes = self.get_ordered_nodes()
        return [node.name for node in nodes if node in self.leaves]
    def get_node(self, name, prevent_error=False):
        """Given a node name as a string, returns the corresponding TreeNode object."""
        if self._remove_name_quotes and (name[0] == name[-1] == "'" or name[0] == name[-1] == '"'):
            name = name[1:-1]
        node = self.node_names.get(name, None)
        if node is None and not prevent_error:
            raise PhyloValueError("Error: could not find a TreeNode object named {}".format(name))
        return node
    def get_nodes(self, names):
        """Given a list of strings, returns a list of TreeNode objects with those names."""
        nodes = []
        for name in names:
            node = self.get_node(name, prevent_error=True)
            if node == None:
                if verbose:
                    print('Warning: could not find a TreeNode named {}.'.format(name))
            else:
                nodes.append(node)
        return nodes
    def get_nodes_starting_with(self, prefixes):
        """Given a list of strings, returns a list of TreeNode objects whose names begin with those strings."""
        if self._remove_name_quotes:
            prefixes = [pref[1:-1] if pref[0] == pref[-1] == "'" or pref[0] == pref[-1] == '"' else pref for pref in prefixes]
        return [node for name, node in self.node_names.items() if name.startswith(tuple(prefixes))]
    def get_ordered_nodes(self):
        """Returns self.nodes as an ordered list. It starts with self.root, then its first child, then that child's first child, and so on in a depth-first pre-order (NLR) traversal."""
        nodes = []
        self.build_nodes_list(self.root, nodes)
        return nodes
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
    def get_subtree(self, names, keep_root_branch=False):
        """Returns a new Tree object of the subtree containing all nodes specified by 'names'."""
        nodes = self.get_nodes(names)
        rca = self.get_recent_common_ancestor(nodes)
        return self.get_node_subtree(rca, keep_root_branch)
    def get_node_subtree(self, node, keep_root_branch=False):
        """Returns a new Tree object of the subtree rooted at node."""
        subtree = Tree(support_label=self._support_label, remove_name_quotes=self._remove_name_quotes)
        subtree._is_cladogram = self._is_cladogram
        subtree._cladogram_branch = self._cladogram_branch
        subtree._node_id_template = self._node_id_template
        subtree.root = node.copy(subtree)
        if not keep_root_branch:
            subtree.root.branch = 0.0
        self.copy_nodes(node, subtree.root, subtree)
        subtree.process_tree_nodes()
        return subtree
    def copy(self):
        """Returns a deep copy of the current Tree object."""
        new_tree = Tree(support_label=self._support_label, remove_name_quotes=self._remove_name_quotes)
        new_tree.name = self.name
        new_tree._is_cladogram = self._is_cladogram
        new_tree._cladogram_branch = self._cladogram_branch
        new_tree._node_id_template = self._node_id_template
        new_tree._node_ids = self._node_ids.copy()
        new_tree._node_id_index = self._node_id_index
        new_tree.root = self.root.copy(new_tree)
        self.copy_nodes(self.root, new_tree.root, new_tree)
        new_tree.process_tree_nodes()
        return new_tree

    # # #  Functions to extract information
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
    def get_distance_matrix(self):
        """Returns a sorted list of strings, and a 2D Numpy array. The phylogenetic distance between tree leaves i and j from 'names' is found by 'dist_mat[i,j]'."""
        names = self.get_named_leaves()
        num_names = len(names)
        dist_mat = np.zeros((num_names, num_names), dtype='float')
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
        self.reset_nodes()
        try:
            newick_str, final_r = self.clean_newick_string(newick_str)
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
            raise PhyloParseError('Error: malformed Newick data.')
        self.process_tree_nodes()
    def save_newick(self, tree_filename, support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=None):
        tree_string = self.newick_string(support_as_comment, support_values, comments, internal_names, max_name_length)
        with open(tree_filename, 'w') as f:
            f.write(tree_string)
    def newick_string(self, support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=None):
        if internal_names: # Otherwise support_as_comment defaults to True
            internal_names = False
            for node in self.nodes:
                if node not in self.leaves and node.name != node.id:
                    internal_names = True
                    break
        if support_values and internal_names: # The only way to save both supports and internal names.
            support_as_comment = True
        replacer_fxn = self.create_string_replacer_function(self._newick_replacements)
        try:
            return self.format_newick_string(self.root, replacer_fxn, set(), support_as_comment, support_values, comments, internal_names, max_name_length) + ';'
        except PhyloUniqueNameError as err:
            # This is so the entire recursive stack isn't printed on error
            raise PhyloUniqueNameError(str(err))

    # # #  NEXUS parsing and saving functions
    def parse_nexus(self, nexus_str, internal_as_names=False):
        tree_commands, translate_command = self.parse_nexus_tree_commands(nexus_str)
        if len(tree_commands) > 1:
            raise PhyloParseError("Error: multiple trees detected. Use the function 'load_multiple_nexus()' instead.")
        self.reset_nodes()
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
            self.reset_nodes()
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
    def save_nexus(self, tree_filename, translate_command=False, support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=None):
        tree_string = self.nexus_string(translate_command, support_as_comment, support_values, comments, internal_names, max_name_length)
        with open(tree_filename, 'w') as f:
            f.write(tree_string)
    def nexus_string(self, translate_command=False, support_as_comment=False, support_values=True, comments=True, internal_names=True, max_name_length=None):
        indent = '    '
        nexus_buff = ['#NEXUS', '', 'BEGIN TREES;']
        if translate_command:
            self = self.copy() # Nodes are renamed, so now the original Tree is unaffected.
            trans_str = self.nexus_translate_string_dict(indent, internal_names, max_name_length)
            nexus_buff.append(trans_str)
        try:
            newick_str = self.newick_string(support_as_comment, support_values, comments, internal_names, max_name_length)
        except PhyloUniqueNameError as err:
            raise PhyloUniqueNameError(str(err).replace('Newick', 'NEXUS'))
        replacer_fxn = self.create_string_replacer_function(self._nexus_replacements)
        tree_name = replacer_fxn(self.name) if self.name else 'tree'
        nexus_buff.append('{}Tree {} = {}'.format(indent, tree_name, newick_str))
        nexus_buff.append('END;')
        return '\n'.join(nexus_buff)

    # # #  PhyloXML parsing and saving functions
    def parse_phyloxml(self, phylo_str):
        phylos, ns = self.parse_phyloxml_phylogenies(phylo_str)
        if len(phylos) > 1:
            raise PhyloParseError("Error: multiple phylogenies detected. Use the function 'load_multiple_phyloxml()' instead.")
        else:
            phy = phylos[0]
        self.reset_nodes()
        self.name = phy.findtext('name', None) or phy.findtext(ns + 'name', None)
        root_e = phy.find('clade')
        if root_e == None:
            root_e = phy.find(ns + 'clade')
        self.root = self.new_tree_node()
        self.parse_phyloxml_element_info_to_node(self.root, root_e, ns)
        self.traverse_phyloxml(self.root, root_e, ns)
        self.process_tree_nodes()
    def parse_multiple_phyloxml(self, phylo_str):
        phylos, ns = self.parse_phyloxml_phylogenies(phylo_str)
        trees = []
        for phy in phylos:
            self.reset_nodes()
            root_e = phy.find(ns + 'clade')
            self.root = self.new_tree_node()
            self.parse_phyloxml_element_info_to_node(self.root, root_e, ns)
            self.traverse_phyloxml(self.root, root_e, ns)
            #self.process_tree_nodes() This is done in copy()
            trees.append(self.copy())
        return trees
    def save_phyloxml(self, tree_filename, support_values=True, comments=True, internal_names=True, max_name_length=None):
        tree_string = self.phyloxml_string(support_values, comments, internal_names, max_name_length)
        with open(tree_filename, 'w') as f:
            f.write(tree_string)
    def phyloxml_string(self, support_values=True, comments=True, internal_names=True, max_name_length=None):
        e_tree = ET.Element('phyloxml')
        e_tree.set('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
        e_tree.set('xsi:schemaLocation', 'http://www.phyloxml.org http://www.phyloxml.org/1.10/phyloxml.xsd')
        e_tree.set('xmlns', 'http://www.phyloxml.org')
        phylogeny = ET.SubElement(e_tree, 'phylogeny')
        phylogeny.set('rooted', 'true')
        phylogeny.set('rerootable', 'true')
        replacer_fxn = self.create_string_replacer_function(self._phyloxml_replacements)
        if self.name:
            name_e = ET.SubElement(phylogeny, 'name')
            name_e.text = replacer_fxn(self.name)
        try:
            self.add_nodes_to_phyloxml(self.root, phylogeny, replacer_fxn, set(), support_values, comments, internal_names, max_name_length)
        except PhyloUniqueNameError as err:
            raise PhyloUniqueNameError(str(err))
        return ET.tostring(e_tree, encoding='UTF-8', method='xml').decode()

    # # #  NeXML parsing and saving functions
    def parse_nexml(self, nexml_str):
        otus, tree_es, ns = self.parse_nexml_otus_trees(nexml_str)
        if len(tree_es) > 1:
            raise PhyloParseError("Error: multiple trees detected. Use the function 'load_multiple_nexml()' instead.")
        self.reset_nodes()
        self.parse_nexml_tree_element(tree_es[0], ns)
        self.process_tree_nodes()
    def parse_multiple_nexml(self, nexml_str):
        trees = []
        otus, tree_es, ns = self.parse_nexml_otus_trees(nexml_str)
        for tree_e in tree_es:
            self.reset_nodes()
            self.parse_nexml_tree_element(tree_e, ns)
            trees.append(self.copy())
        return trees
    def save_nexml(self, tree_filename, support_values=True, comments=True, internal_names=True, max_name_length=None):
        tree_string = self.nexml_string(support_values, comments, internal_names, max_name_length)
        with open(tree_filename, 'w') as f:
            f.write(tree_string)
    def nexml_string(self, support_values=True, comments=True, internal_names=True, max_name_length=None):
        e_tree = ET.Element('nexml')
        e_tree.set('version', '0.9')
        e_tree.set('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
        e_tree.set('xmlns:nex', 'http://www.nexml.org/2009')
        e_tree.set('xmlns', 'http://www.nexml.org/2009')
        e_tree.set('xsi:schemaLocation', 'http://www.nexml.org/2009 http://www.nexml.org/2009/nexml.xsd')
        e_tree.set('generator', 'molecbio.phylo.py')
        replacer_fxn = self.create_string_replacer_function(self._nexml_replacements)
        otus = sorted(replacer_fxn(node.name)[:max_name_length] for node in self.nodes if node in self.leaves or (internal_names and node.name != node.id))
        otus_id, node_ids = self.add_nexml_otus(e_tree, otus)
        trees_e = ET.SubElement(e_tree, 'trees')
        trees_e.set('id', 'trees1')
        trees_e.set('otus', otus_id)
        tree_id = replacer_fxn(self.name) if self.name else 'tree1'
        self.add_nexml_nodes_edges(trees_e, tree_id, node_ids, replacer_fxn, support_values, comments, internal_names, max_name_length)
        return ET.tostring(e_tree, encoding='UTF-8', method='xml').decode()

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
        final_bracket, cur_len = 0, 0
        for data in self.separate_square_comments(newick_str):
            if data[0] != '[':
                clean_data = ''.join(data.split())
                str_buff.append(clean_data)
                brck_ind = clean_data.rfind(')')
                if brck_ind != -1:
                    final_bracket = cur_len + brck_ind
                cur_len += len(clean_data)
            else:
                str_buff.append(data)
                cur_len += len(data)
        return ''.join(str_buff), final_bracket
    def parse_newick_node_data(self, data):
        # 'data' is a string with layout 'name[comment]:branch[support]', where all 4 parts are optional.
        if not data:
            return '', '', '', ''
        name, comment, branch, support = '', '', '', ''
        segs = self.separate_square_comments(data)
        if len(segs) == 4:
            if segs[0][0] != '[' and segs[1][0] == '[' and segs[2][0] == ':' and segs[3][0] == '[':
                name, comment, branch, support = segs
            else:
                raise PhyloParseError('Error: malformed Newick data.')
        elif len(segs) == 3:
            if segs[0][0] != '[' and segs[1][0] == '[' and segs[2][0] == ':':
                name, comment, branch = segs
            elif segs[0][0] == '[' and segs[1][0] == ':' and segs[2][0] == '[':
                comment, branch, support = segs
            else:
                raise PhyloParseError('Error: malformed Newick data.')
        elif len(segs) == 2:
            if ':' in segs[0] and segs[1][0] == '[':
                name_branch, support = segs
                name, _, branch = name_branch.partition(':')
            elif segs[0][0] != '[' and segs[1][0] == '[':
                name, comment = segs
            elif segs[0][0] == '[' and segs[1][0] == ':':
                comment, branch = segs
            else:
                raise PhyloParseError('Error: malformed Newick data.')
        elif len(segs) == 1:
            if segs[0][0] == '[':
                comment = segs[0]
            else:
                name, _, branch = segs[0].partition(':')
        else:
            raise PhyloParseError('Error: malformed Newick data.')
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
    def format_newick_string(self, node, replacer_fxn, all_names, support_as_comment, support_values, comments, internal_names, max_name_length):
        name = replacer_fxn(node.name)[:max_name_length] if node.name != node.id else ''
        if name != '':
            if name in all_names:
                raise PhyloUniqueNameError("Error: cannot save tree in Newick format. After removing restricted characters and truncating to {} characters, two nodes ended up with the name '{}'".format(max_name_length, name))
            else:
                all_names.add(name)
        comment = '[{}]'.format(node.comment) if node.comment else ''
        if node in self.leaves:
            if comments:
                name += comment
            if self._is_cladogram:
                return name
            else:
                return '{}:{}'.format(name, self.format_branch(node.branch))
        else:
            children_buff = ['(', ','.join(self.format_newick_string(child, replacer_fxn, all_names, support_as_comment, support_values, comments, internal_names, max_name_length) for child in node.children), ')']
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

    # # #  Misc NEXUS parsing and saving functions
    def parse_nexus_blocks(self, nexus_str):
        nexus_str = nexus_str.strip()
        if nexus_str[:7].lower() != '#nexus\n':
            raise PhyloParseError("Error: malformed NEXUS file.")
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
                raise PhyloParseError("Error: malformed NEXUS file. No valid command found within line '{}'.".format(line))
            cmd_line = ''.join(cmds[cmd_ind :]).strip()
            if cmd_line.lower().startswith('begin '):
                block = cmd_line[6:].lower().strip()
                if block in blocks:
                    raise PhyloParseError("Error: the NEXUS file contains multiple '{}' blocks.".format(block))
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
            raise PhyloParseError("Error: malformed NEXUS file. The final block had no end.")
        return blocks
    def parse_nexus_tree_commands(self, nexus_str):
        tree_commands, translate_command = [], None
        blocks = self.parse_nexus_blocks(nexus_str)
        trees_block = blocks.get('trees', None)
        if trees_block == None:
            raise PhyloParseError('Error: malformed NEXUS file. No TREES block in the given NEXUS file.')
        for cmd, data in trees_block:
            if cmd == 'translate':
                translate_command = data
            elif cmd == 'tree':
                tree_commands.append(data)
        if not tree_commands:
            raise PhyloParseError('Error: malformed NEXUS file. No trees found in the given NEXUS file.')
        return tree_commands, translate_command
    def format_nexus_translation(self, translate_command):
        trans = {}
        for entry in translate_command.split(','):
            name1, _, name2 = entry.strip().partition(' ')
            trans[name1] = name2
        return trans
    def nexus_translate_string_dict(self, indent, internal_names, max_name_length):
        replacer_fxn = self.create_string_replacer_function(self._newick_replacements)
        trans_buff, trans_ind, uniq_names = [], 1, set()
        for node in self.nodes:
            if node.name != node.id and (internal_names or node in self.leaves):
                clean_name = replacer_fxn(node.name)[:max_name_length]
                if clean_name in uniq_names:
                    raise PhyloUniqueNameError("Error: cannot save tree in NEXUS format. After removing restricted characters and truncating to {} characters, two nodes ended up with the name '{}'".format(max_name_length, clean_name))
                uniq_names.add(clean_name)
                new_name = 'n{}'.format(trans_ind)
                trans_ind += 1
                trans_buff.append('{}{} {}'.format(indent, new_name, clean_name))
                node.rename(new_name)
        return '{}Translate\n{};'.format(indent, ',\n'.join(trans_buff))

    # # #  Misc phyloxml parsing and saving functions
    def parse_phyloxml_phylogenies(self, phylo_str):
        try:
            ET_root = ET.fromstring(phylo_str.strip())
        except:
            raise PhyloParseError("Error: malformed PhyloXML file.")
        if 'phyloxml' not in ET_root.tag:
            raise PhyloParseError("Error: malformed file format. The first element of a PhyloXML file must have the tag 'phyloxml'.")
        ns, _, _ = ET_root.tag.rpartition('phyloxml')
        phylos = ET_root.findall('phylogeny') + ET_root.findall(ns + 'phylogeny')
        if len(phylos) == 0:
            raise PhyloParseError("Error: malformed file format. No phylogenies were found.")
        return phylos, ns
    def traverse_phyloxml(self, node, element, ns):
        for child_element in element.findall('clade') + element.findall(ns + 'clade'):
            child_node = self.new_tree_node(node)
            self.parse_phyloxml_element_info_to_node(child_node, child_element, ns)
            node.children.append(child_node)
            self.traverse_phyloxml(child_node, child_element, ns)
    def parse_phyloxml_element_info_to_node(self, node, element, ns):
        seq_element = element.find('sequence')
        if seq_element == None:
            seq_element = element.find(ns + 'sequence')
        name = element.findtext('name', None) or element.findtext(ns + 'name', None)
        if not name and seq_element is not None:
            name = seq_element.findtext('name', None) or seq_element.findtext(ns + 'name', None)
        node.name = name
        branch = element.findtext('branch_length', None) or element.findtext(ns + 'branch_length', None)
        if branch == None:
            branch = element.get('branch_length')
        node.branch = branch
        confidence = element.find('confidence')
        if confidence == None:
            confidence = element.find(ns + 'confidence')
        if confidence is not None:
            node.support = confidence.text
            con_type = confidence.get('type')
            if con_type:
                node.support_type = con_type
        prop_e = element.find('property')
        if prop_e == None:
            prop_e = element.find(ns + 'property')
        if prop_e is not None:
            if prop_e.get('applies_to') == 'clade' and prop_e.get('ref') == 'comment':
                node.comment = prop_e.text
    def add_nodes_to_phyloxml(self, node, parent_element, replacer_fxn, all_names, support_values, comments, internal_names, max_name_length):
        element = ET.SubElement(parent_element, 'clade')
        name = replacer_fxn(node.name)[:max_name_length] if node.name != node.id else ''
        if name != '':
            if name in all_names:
                raise PhyloUniqueNameError("Error: cannot save tree in PhyloXML format. After removing restricted characters and truncating to {} characters, two nodes ended up with the name '{}'".format(max_name_length, name))
            else:
                all_names.add(name)
        if name and (internal_names or node in self.leaves):
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
            prop_e.text = replacer_fxn(str(node.comment))
            element.append(prop_e)
        for child in node.children:
            self.add_nodes_to_phyloxml(child, element, replacer_fxn, all_names, support_values, comments, internal_names, max_name_length)

    # # #  Misc NeXML parsing and saving functions
    def parse_nexml_otus_trees(self, nexml_str):
        try:
            ET_root = ET.fromstring(nexml_str.strip())
        except:
            raise PhyloParseError("Error: malformed NeXML file.")
        if 'nexml' not in ET_root.tag:
            raise PhyloParseError("Error: malformed NeXML file. The first element of a NeXML file must have the tag 'nexml'.")
        ns, _, _ = ET_root.tag.rpartition('nexml')
        otus = ET_root.find('otus')
        if otus == None:
            otus = ET_root.find(ns + 'otus')
        if otus == None:
            if verbose:
                print("Warning: malformed NeXML file. No 'otus' block was found, but parsing can continue.")
        trees_e = ET_root.find('trees')
        if trees_e == None:
            trees_e = ET_root.find(ns + 'trees')
        if trees_e == None:
            raise PhyloParseError("Error: malformed NeXML file. No 'trees' block was found.")
        trees = trees_e.findall('tree') + trees_e.findall(ns + 'tree')
        if len(trees) == 0:
            raise PhyloParseError("Error: malformed NeXML file. No 'tree' blocks were found.")
        return otus, trees, ns
    def parse_nexml_tree_element(self, tree_e, ns):
        self.name = tree_e.get('id')
        node_e_ids = {}
        for node_e in tree_e.findall('node') + tree_e.findall(ns + 'node'):
            e_id = node_e.get('id')
            if e_id == None:
                raise PhyloParseError("Error: malformed NeXML file. A node element was found with no 'id' attribute.")
            node = self.new_tree_node()
            self.parse_nexml_element_info_to_node(node, node_e, ns)
            node_e_ids[e_id] = node
        target_e_ids = set()
        for edge_e in tree_e.findall('edge') + tree_e.findall(ns + 'edge'):
            src, trg = edge_e.get('source'), edge_e.get('target')
            if src not in node_e_ids or trg not in node_e_ids:
                raise PhyloParseError("Error: malformed NeXML file. An edge had an unrecognized source or target.")
            target_e_ids.add(trg)
            node_e_ids[trg].branch = edge_e.get('length', None)
            node_e_ids[trg].parent = node_e_ids[src]
            node_e_ids[src].children.append(node_e_ids[trg])
        if self.root == None:
            root_e_id = (set(node_e_ids) - target_e_ids).pop()
            self.root = node_e_ids[root_e_id]
        root_edge_e = tree_e.find('rootedge')
        if root_edge_e == None:
            root_edge_e = tree_e.find(ns + 'rootedge')
        if root_edge_e is not None:
            self.root.branch = root_edge_e.get('length', None)
    def parse_nexml_element_info_to_node(self, node, node_e, ns):
        node.name = node_e.get('label', None)
        for meta_e in node_e.findall('meta') + node_e.findall(ns + 'meta'): # comments and support
            val = meta_e.get('content')
            prop_ns, _, prop = meta_e.get('property').partition(':')
            if not prop:
                prop = prop_ns # Not really correct, but some programs do this.
            if prop.lower().startswith('confidence_'):
                node.support_type = prop[11:] or None
                node.support = float(val)
            else:
                if node.comment:
                    node.comment = '{};{}'.format(node.comment, val)
                else:
                    node.comment = val
        if node_e.get('root','').lower() == 'true':
            if self.root != None:
                raise PhyloParseError("Error: this software was not designed to parse trees with multiple roots.")
            else:
                self.root = node
    def add_nexml_otus(self, e_tree, otus):
        # Expects 'otus' to be a list of the names of all leaves, plus all named internal nodes if internal_nodes == True. These names must already have been cleaned using a replacer_fxn
        otus_id = 'otus1'
        otus_e = ET.SubElement(e_tree, 'otus')
        otus_e.set('id', otus_id)
        node_ids = {}
        id_pref, _, _ = self._node_id_template.partition('{')
        _, _, id_suff = self._node_id_template.rpartition('}')
        for i, name in enumerate(otus):
            otu_id = 'o{}'.format(i)
            otu_e = ET.SubElement(otus_e, 'otu')
            otu_e.set('id', otu_id)
            if not (name.startswith(id_pref) and name.endswith(id_suff)):
                otu_e.set('label', name)
            node_ids[name] = {'otu':otu_id}
        return otus_id, node_ids
    def add_nexml_nodes_edges(self, trees_e, tree_id, node_ids, replacer_fxn, support_values, comments, internal_names, max_name_length):
        tree_e = ET.SubElement(trees_e, 'tree')
        tree_e.set('xsi:type', 'nex:FloatTree')
        tree_e.set('id', tree_id)
        ordered_nodes, clean_names, uniq_names = self.get_ordered_nodes(), {}, set()
        for i, node in enumerate(ordered_nodes):
            clean_name = replacer_fxn(node.name)[:max_name_length]
            node_e = ET.SubElement(tree_e, 'node')
            node_id = 'n{}'.format(i)
            node_e.set('id', node_id)
            if node == self.root:
                node_e.set('root', 'true')
            if node in self.leaves or (internal_names and node.name != node.id):
                node_e.set('otu', node_ids[clean_name]['otu'])
                if node.name != node.id:
                    node_e.set('label', clean_name)
                    if clean_name in uniq_names:
                        raise PhyloValueError("Error: cannot save tree in NeXML format. After removing restricted characters, two nodes ended up with the name '{}'".format(clean_name))
                    uniq_names.add(clean_name)
            if support_values and node.support != None:
                meta_id = node_id+'_s0'
                _property = 'nex:confidence_'
                if node.support_type:
                    _property += node.support_type
                self.add_nexml_meta_element(node_e, meta_id, _property, node.support)
            if comments and node.comment != None:
                meta_id = node_id+'_c0'
                self.add_nexml_meta_element(node_e, meta_id, 'nex:comment', replacer_fxn(node.comment))
            node_ids.setdefault(clean_name, {})['node'] = node_id
            clean_names[node] = clean_name
        if not self._is_cladogram and self.root.branch:
            node_id = node_ids[clean_names[self.root]]['node']
            rootedge_e = ET.SubElement(tree_e, 'rootedge')
            rootedge_e.set('id', 're0')
            rootedge_e.set('target', node_id)
            rootedge_e.set('length', str(self.root.branch))
        for i, node in enumerate(ordered_nodes):
            if node == self.root:
                continue
            edge_id = 'e{}'.format(i)
            trg_id = node_ids[clean_names[node]]['node']
            src_id = node_ids[clean_names[node.parent]]['node']
            edge_e = ET.SubElement(tree_e, 'edge')
            edge_e.set('id', edge_id)
            edge_e.set('target', trg_id)
            edge_e.set('source', src_id)
            if not self._is_cladogram:
                edge_e.set('length', str(node.branch))
    def add_nexml_meta_element(self, node_e, meta_id, _property, content):
        meta_e = ET.SubElement(node_e, 'meta')
        meta_e.set('id', meta_id)
        meta_e.set('datatype', 'string')
        meta_e.set('xsi:type', 'nex:LiteralMeta')
        meta_e.set('property', _property)
        meta_e.set('content', str(content))

    # # #  Misc tree parsing functions
    def reset_nodes(self):
        self.root = None
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
    def remove_tree_node(self, node, remove_from_parent=True):
        """Expects process_tree_nodes() to be called afterwards, as does not modify self.leaves, self.internal or other such attributes."""
        if remove_from_parent and node != self.root:
            node.parent.children.remove(node)
        self._node_ids.remove(node.id)
        self.nodes.remove(node)
    def process_tree_nodes(self):
        """Cleans up the node names, differentiating between internal names and support values. Ensures all nodes have a numerical node.branch value. Sets self._is_cladogram. Fills out the self.leaves and self.internal sets and the self.node_names dict."""
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
                if verbose:
                    print('Warning: non-unique node "{}" was renamed to "{}"'.format(node.name, name))
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

    # # #  Misc functions
    def create_string_replacer_function(self, replacements, ignore_case=False):
        """Returns a function to be used: new_name = fxn(name). If 'ignore_case' is True, the case of the given pattern will be ignored."""
        if ignore_case:
            replacements = dict((k.lower(),v) for k,v in replacements.items())
            pattern = re.compile("|".join([re.escape(k) for k, v in replacements.items()]), re.IGNORECASE)
            replacement_function = lambda match: replacements[match.group(0).lower()]
        else:
            pattern = re.compile("|".join([re.escape(k) for k, v in replacements.items()]))
            replacement_function = lambda match: replacements[match.group(0)]
        return lambda string: pattern.sub(replacement_function, string)
    def format_branch(self, branch):
        if branch == 0:
            return '0'
        elif abs(branch) >= 0.0001:
            return '{:g}'.format(branch)
        else:
            return '{{:.{}f}}'.format(self._max_branch_precision).format(branch)
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
    def build_nodes_list(self, node, lst):
        lst.append(node)
        for child in node.children:
            self.build_nodes_list(child, lst)
    def __str__(self):
        _str = 'phylo.Tree leaves={}'.format(len(self.leaves))
        if self.name != None:
            _str += ', name={}'.format(self.name)
        return _str
    def __repr__(self):
        return '<phylo.Tree at {}>'.format(hex(id(self)))
    def __len__(self):
        return len(self.leaves)


class TreeNode(object):
    def __init__(self, tree, node_id, parent):
        self.tree = tree
        self.id = node_id
        self.parent = parent
        self.children = []
        self.name = None
        self.branch = None
        self.support = None
        self.support_type = None
        self.comment = None
        self._been_processed = False
    def rename(self, new_name):
        if new_name == self.name:
            return
        if new_name in self.tree.node_names:
            raise PhyloValueError("Error: cannot rename node to '{}', as it is not unique.".format(new_name))
        del self.tree.node_names[self.name]
        self.name = new_name
        self.tree.node_names[new_name] = self
    def copy(self, new_tree):
        """Deep copies the current TreeNode, adding it to the Tree object 'new_tree'."""
        new_node = new_tree.new_tree_node(parent=self.parent, node_id=self.id)
        new_node.name = self.name
        new_node.branch = self.branch
        new_node.support = self.support
        new_node.support_type = self.support_type
        new_node.comment = self.comment
        new_node.children = self.children[::]
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
class PhyloError(Exception):
    """Base class for errors originating from this phylo module."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: unspecified problem in phylo.py"
        super(PhyloError, self).__init__(msg)
class PhyloParseError(PhyloError):
    """Error indicating the file could not be parsed."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: problem parsing a phylogenetic tree"
        super(PhyloParseError, self).__init__(msg)
class PhyloValueError(PhyloError):
    """Error indicating an inappropriate value was passed."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: value error in phylo.py"
        super(PhyloValueError, self).__init__(msg)
class PhyloUniqueNameError(PhyloError):
    """Error indicating multiple nodes ended up with the same name."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: unique names error in phylo.py"
        super(PhyloUniqueNameError, self).__init__(msg)
