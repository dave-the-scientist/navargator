// core.js then core_tree_functions.js are loaded before this file.

// =====  Page settings:
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'maintain_interval':2000, 'instance_closed':false, 'maintain_interval_obj':null, 'max_upload_size':20000000
};
// =====  Tree objects and options:
var repvar = {
  'leaves':[], 'chosen':[], 'available':[], 'ignored':[], 'nodes':{},
  'r_paper':null, 'tree_data':null, 'pan_zoom':null,
  'opts' : {
    'fonts' : {
      'tree_font_size':13, 'family':'Helvetica, Arial, sans-serif'
    },
    'sizes' : {
      'tree':700, 'marker_radius':4, 'bar_chart_height':30, 'inner_label_buffer':3, 'bar_chart_buffer':3, 'search_buffer':5
    },
    'colours' : {
      'node':'#E8E8E8', 'chosen':'#24F030', 'available':'#F09624', 'ignored':'#5D5D5D', 'search':'#B0F1F5'
    }
  }
};
