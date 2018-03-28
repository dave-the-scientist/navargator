"""Module to parse a tree in Newick format, converting to phyloXML format. The
input to nwk_to_phyloxml(input) can be the filename of the Newick file, a
file-like object, or the tree data itself as a string. It returns a string.

The class holds the self.etree variable, which can be modified in place. Calling
tostring() parses the etree in its current state.
"""
import os
import xml.etree.ElementTree as ET

class NewickToPhyloxml(object):
    """With Python2.x, self.tree_string includes the xml declaration, but it is
    missing with Python3.x."""
    def __init__(self, tree_input):
        if os.path.isfile(tree_input): nwk_data = open(tree_input).read()
        else: nwk_data = tree_input
        self.leaves = []
        self.edges = {} # Replace some functionality in newick_to_coords
        self.degree = [float('inf'), 0] # [min, max] number of children of all internal nodes.
        self.named_internal_nodes = False # A value of True may indicate a malformed tree file.
        self.__internal_node_tag = 'clade'
        self.__name_tag = 'name'
        self.__branch_tag = 'branch_length'
        self.etree = self.nwk_to_phyloxml_etree(nwk_data)
    def tostring(self):
        # The .decode() is necessary for Python3, as ET returns a byte string.
        return ET.tostring(self.etree, encoding='UTF-8', method='xml').decode()

    # # #  Private methods:
    def nwk_to_phyloxml_etree(self, nwk_data):
        nwk_data = nwk_data.strip()
        tree = ET.Element('phyloxml')
        tree.set('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
        tree.set('xsi:schemaLocation', 'http://www.phyloxml.org http://www.phyloxml.org/1.10/phyloxml.xsd')
        tree.set('xmlns', 'http://www.phyloxml.org')
        phylogeny = ET.SubElement(tree, 'phylogeny')
        phylogeny.set('rooted', 'false')
        phylogeny.set('rerootable', 'true')
        top = ET.SubElement(phylogeny, self.__internal_node_tag)
        self._add_nodes(top, nwk_data)
        self.named_internal_nodes = self._find_node_children_in_tree(top)
        return tree
    def _add_nodes(self, top, newick_str):
        i, nodes = 0, [top]
        r_prev, final_r = False, newick_str.rfind(')')
        while i < len(newick_str):
            lj, rj, cj = (newick_str.find(c, i+1) for c in '(),')
            j = min(x for x in (lj,rj,cj) if x > 0)
            if lj == j: # new internal node.
                nodes.append(ET.SubElement(nodes[-1], self.__internal_node_tag))
            else: # process node.
                name,_,branch = newick_str[i+1:j].partition(':')
                name = name.strip()
                if name and name[0] == name[-1] == "'":
                    name = name[1:-1] # Removes quotes added by Figtree.
                if r_prev: # complete latest internal node.
                    node = nodes.pop()
                    #degree = len(node)
                    #if degree < self.degree[0]: self.degree[0] = degree
                    #if degree > self.degree[1]: self.degree[1] = degree
                    name = '' # what was 'name' is actually the support value (SH or bootstrap). Currently not used.
                else: # new leaf node.
                    if name:
                        self.leaves.append(name)
                    node = ET.SubElement(nodes[-1], self.__internal_node_tag) # new 'leaf' tag?
                self._add_name_branch(node, name, branch)
                #self._find_node_degree(node)
            if j == final_r:
                #self._find_node_degree(top)
                break
            if rj == j: r_prev = True
            else: r_prev = False
            i = j
    def _add_name_branch(self, node, name, branch):
        """Ensures the 'name' entry, if any, preceeds the 'branch_length' entry, if any."""
        if branch:
            b = ET.Element(self.__branch_tag)
            b.text = branch
            node.insert(0, b)
        if name:
            n = ET.Element(self.__name_tag)
            n.text = name
            node.insert(0, n)
    def _find_node_degree(self, node):
        # This isn't tracking degree, but rather number of children. Update variable names.
        # This method isn't covering the case of 1 internal node with 1 leaf child. Remedy this.
        degree = 0
        for entry in node:
            if entry.tag == self.__internal_node_tag:
                degree += 1
        if degree < self.degree[0]: self.degree[0] = degree
        if degree > self.degree[1]: self.degree[1] = degree

    def _find_node_children_in_tree(self, node):
        """Fills out self.degree, which is a list indicating the minimum and maximum number of children possessed by a node in the tree. The return value indicates if any internal nodes have both a labeled name and children. In general, this should be False."""
        num_children = 0
        has_name, has_children = False, False
        previous_name_and_children = False
        for n in node:
            if n.tag == self.__internal_node_tag:
                has_children = True
                num_children += 1
                if self._find_node_children_in_tree(n) == True:
                    previous_name_and_children = True
            elif n.tag == self.__name_tag:
                has_name = True
        if has_children:
            if num_children < self.degree[0]:
                self.degree[0] = num_children
            if num_children > self.degree[1]:
                self.degree[1] = num_children
            if has_name:
                return True
        return previous_name_and_children
