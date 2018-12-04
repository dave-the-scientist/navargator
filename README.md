NaVARgator
==========

What does it do?
----------------

NaVARgator is software designed to aid in clustering phylogenetic trees (or any tree, really), by identifying a user-defined number of "central variants". Each cluster is defined as one central variant as well as all other variants that are not closer (as measured by branch lengths) to another central variant. The central variants are chosen to minimize the total distance from every variant to its cluster center; put another way, NaVARgator identifies a specified number of variants in your tree such that as many variants as possible are as close as possible to at least one.

Unique among other phylogenetic tree clustering software (at least, as far as I can tell), NaVARgator allows you control over how the clustering proceeds. It does this by allowing you (the user) to assign variants as ignored, chosen, or available. If you have an outgroup in your tree, incorrect variants (ex: misclassified species/genes), or any other variants that you don't want to actually affect the clustering calculations, assign them as __ignored__. If you have variants that you deem especially important (perhaps they're extra virulent, or just what you work on in your lab), assigning them as __chosen__ will ensure that they will end up as cluster centers. The remainder of the central variants will be picked from the variants assigned as __available__. This can be everything else in the tree or just a subset; if your phylogenetic tree contains variants from publicly available data, or variants that you don't have access to for any reason, simply leave them unassigned. They will still impact the clustering calculations, but cannot be chosen as central variants. Not only do these variant assignments help immensely with keeping NaVARgator fast, but they allow you to ensure the predictions are relevant to your own situation.

To read more about NaVARgator, check out the publication (coming soon, hopefully).

How can I run NaVARgator?
-------------------------

NaVARgator can be run as an online tool or by installing it and running it on your own computer. The online version has restrictions on the size of trees and the type of clustering it can do, and can be found [right here, soon](www.compsysbio.org/navargator). The local version of the software has no limits, but does require you to install it.

### Installation instructions

Coming soon. To install the current development version, ensure you have Python (2 or 3) installed, as well as the Python packages numpy, flask, and tkinter. Then you can clone this github repository. Finally, navigate into that cloned directory and start it with the command `python navargator.py`. You can use the interface to locate a phylogenetic tree in newick format, or a previously saved navargator session (.nvrgtr file). To directly load one of those files, use the command `python navargator.py INPUT_FILE`.
