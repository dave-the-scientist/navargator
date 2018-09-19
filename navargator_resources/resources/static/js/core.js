// TODO:
// - Finish updateClusterTransColour(key, colour); need to inform the user when a colour can't be made.
// - Many of the opts.colours should be pulled from core.css.
// - Finish defining error codes in processError().

// =====  Common options and parameters
var nvrgtr_page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'browser_id':'', 'instance_closed':false, 'maintain_interval':2000, 'maintain_interval_obj':null, 'max_upload_size':20000000
};
var nvrgtr_data = { // Variables used by each page.
  'leaves':[], 'chosen':[], 'available':[], 'ignored':[], 'search_results':[], 'selected':{}, 'num_selected':0, 'allow_select':true, 'considered_variants':{}, 'lc_leaves':{}, 'tree_data':null, 'nodes':{}, 'tree_background':null, 'r_paper':null, 'pan_zoom':null
};
var nvrgtr_settings = { // Page-specific settings, not user-modifiable.
  'graph' : {
    'histo_bins':15, 'total_width':null, 'total_height':null
  }
};
var nvrgtr_opts = { // User-modifiable settings that persist between pages and sessions.
  'fonts' : {
    'tree_font_size':13, 'family':'Helvetica, Arial, sans-serif'
  },
  'sizes' : {
    'tree':null, 'max_variant_name_length':15, 'small_marker_radius':2, 'big_marker_radius':3, 'bar_chart_height':30, 'labels_outline':0.5, 'cluster_expand':4, 'cluster_smooth':0.75, 'inner_label_buffer':4, 'bar_chart_buffer':3, 'search_buffer':7
  },
  'colours' : {
    'default_node':'#E8E8E8', 'chosen':'#24F030', 'available':'#24B1F0', 'ignored':'#5D5D5D', 'search':'#C6FF6F', 'cluster_outline':'#000', 'cluster_background':'#EAFEEC', 'cluster_highlight':'#92F7E4', 'singleton_cluster_background':'#9624F0', 'selection':'#FAB728', 'bar_chart':'#1B676B', 'tree_background':'#FFFFFF', 'cluster_opacity':0.43, 'cluster_background_trans':null, 'cluster_highlight_trans':null
  }
};

// set a default for nvrgtr_opts.sizes.tree; if different from the css value on page load, set the css global value


// =====  Convenience and error handling:
function showErrorPopup(message, title) {
  $("#errorDialogText").text(message);
  if (!title) {
    title = "NaVARgator error";
  }
  $("#errorDialog").dialog("option", "title", title);
  $("#errorDialog").dialog("open");
}
function processError(error, message) {
  console.log('Error occurred. The error object:');
  console.log(error);
  if (error.status == 559) {
    showErrorPopup(message+", as the server didn't recognize the given session ID. This generally means your session has timed out.");
  } else if (error.status == 0) {
    showErrorPopup(message+", as no response was received. This generally means the program has stopped or the web server is down.");
  } else {
    showErrorPopup(message+"; the server returned code "+error.status);
  }
}

// =====  Common functional elements:
function initializeButtons() {
  // Standardizes appearances across browsers, and provides some additional functionality to various elements.
  $(".jq-ui-button").button(); // Converts html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $(".nvrgtr-checkbox-label").addClass("prevent-text-selection").children("input[type=radio]").after("<span class='nvrgtr-radio-checkbox'></span>");
  $(".nvrgtr-checkbox-label").children("input[type=checkbox]").after("<span class='nvrgtr-checkbox'></span>");
}
function initializeErrorPopupWindow() {
  // Sets up error dialog, which is hidden until called with showErrorPopup(message, title).
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
}
function initializeCollapsibleElements() {
  $(".collapsible-header").addClass("prevent-text-selection").after("<div class='collapsible-icon-div'><span class='collapsible-span1'></span><span class='collapsible-span2'></span></div>");
  $(".collapsible-header.collapsible-header-open").each(function() {
    var pane = $(this).nextAll("div.collapsible-panel").first();
    pane.css('maxHeight', pane[0].scrollHeight+'px');
  });
  $(".collapsible-header").click(function() {
    collapsibleElementHandler($(this));
  });
  $(".collapsible-icon-div").click(function() {
    collapsibleElementHandler($(this).prev(".collapsible-header"));
  });
}
function collapsibleElementHandler(header) {
  var pane = header.nextAll("div.collapsible-panel").first();
  if (header.hasClass("collapsible-header-open")) {
    header.removeClass("collapsible-header-open");
    pane.css('maxHeight', "0px");
  } else {
    header.addClass("collapsible-header-open");
    pane.css('maxHeight', pane[0].scrollHeight+"px");
  }
}
function initializeFloatingPanes() {
  $(".floating-pane-close").each(function() {
    $(this).append('<span class="floating-pane-close-span1">');
    $(this).append('<span class="floating-pane-close-span2">');
    $(".floating-pane-header").addClass("prevent-text-selection");
    var pane = $(this).parent().parent();
    $(this).click(function() {
      pane.css('maxWidth', "0px");
      pane.css('maxHeight', "0px");
    });
  });
}
function showFloatingPane(pane) {
  pane.css('maxWidth', pane[0].scrollWidth+"px");
  pane.css('maxHeight', pane[0].scrollHeight+"px");
}
function setupDisplayOptionsPane() {
  $("#displayTreeFontSizeSpinner").spinner({
    min: 0, max: 48,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_opts.fonts.tree_font_size = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_opts.fonts.tree_font_size = parseInt(this.value);
    }
  }).spinner('value', nvrgtr_opts.fonts.tree_font_size);
  $("#displayTreeLabelOutlineSpinner").spinner({
    min: 0, max: 10,
    numberFormat: 'N1', step: 0.1,
    spin: function(event, ui) {
      nvrgtr_opts.sizes.labels_outline = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_opts.sizes.labels_outline = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_opts.sizes.labels_outline);
  $("#redrawTreeButton").click(function() {
    redrawTree();
  });

  setColourPickers();
  // Ensure that if the transparency or tree background is changed, updateClusterColours() is called.
}
function redrawTree() {
  // Overwritten in input.js and results.js to redraw the tree and reset visible elements.
}
function setColourPickers() {
  /*Updates the colour pickers to reflect the current values in nvrgtr_opts.colours*/

  //$("#cluster-colour")[0].jscolor.fromString(opts.colours.clusters); // Set colour
  //opts.colours.bar_chart = '#' + $("#bar-colour")[0].value; // Get colour

  //var key_list = ['available', 'chosen', 'ignored', 'default_node', 'cluster_background', 'singleton_cluster_background', 'bar_chart', 'cluster_highlight', 'selection', 'search'];
  var key_list = ['available', 'chosen', 'ignored', 'default_node', 'cluster_background', 'singleton_cluster_background', 'cluster_highlight', 'selection'];
  var key, colour, picker_id;
  for (var i=0; i<key_list.length; ++i) {
    key = key_list[i];
    colour = nvrgtr_opts.colours[key];
    picker_id = '#' + key + "_colourPicker";
    $(picker_id)[0].jscolor.fromString(colour);
  }
}
function updateDisplayColour(key, jscolor) {
  /*Called directly by the colour picker elements.*/
  var colour = '#' + jscolor;
  if (key in nvrgtr_opts.colours) {
    nvrgtr_opts.colours[key] = colour;
    if (['available', 'chosen', 'ignored', 'default_node', 'singleton_cluster_background'].indexOf(key) > -1) {
      updateVariantColours();
    } else if (['cluster_background', 'cluster_highlight'].indexOf(key) > -1) {
      //       ^ This list must match that in updateClusterColours().
      updateClusterTransColour(key, colour);
    }
    if (['cluster_highlight', 'selection'].indexOf(key) > -1) {
      // cluster_highlight must be in 2 categories; above for the clusters, here for the nodes/labels.
    }
  } else {
    showErrorPopup("Error setting colour; key '"+key+"' not recognized. Please report this issue on the NaVARgator github page.", "NaVARgator colour picker");
  }
}
function updateVariantColours() {
  var colour;
  $.each(nvrgtr_data.nodes, function(name, node) {
    colour = nvrgtr_opts.colours[node.node_rest_key];
    node.node_rest_colour = colour;
    if (!node.selected && !node.mouseover) {
      node.circle.attr({fill:colour});
    }
  });
  updateTreeLegend();
  updateVariantColoursFollowup();
}
function updateClusterColours() {
  var key, keys = ['cluster_background', 'cluster_highlight'];
  for (var i=0; i<keys.length; ++i) {
    key = keys[i];
    updateClusterTransColour(key, nvrgtr_opts.colours[key]);
  }
}
function updateClusterTransColour(key, colour) {
  var ret = calculateTransparentComplement(colour, nvrgtr_opts.colours.cluster_opacity, nvrgtr_opts.colours.tree_background);
  var trans_comp = (ret.closest_colour == '') ? ret.trans_comp : ret.closest_colour,
    trans_key = key + '_trans';
  nvrgtr_opts.colours[trans_key] = trans_comp;
  updateClusterTransColourFollowup(key, trans_comp);
  if (ret.closest_colour != '') {
    // TODO: Show warning popup.
  }
}
function updateVariantColoursFollowup() {
  // Overwritten in input.js to update elements with new colours.
}
function updateClusterTransColourFollowup(key, trans_comp) {
  // Overwritten in results.js to update elements with new colours.
}

// =====  Page maintainance and management:
function generateBrowserId(length) {
  var b_id = 'b';
  for (var i=0; i<length; ++i) {
    b_id += Math.floor(Math.random() * 10); // Adds an integer from [0,9].
  }
  return b_id;
}
function daemonURL(url) {
  // Prefix used for private routes. Doesn't matter what it is, but it must match the daemonURL function in navargator_daemon.py
  return nvrgtr_page.server_url + '/daemon' + url;
}
function maintainServer() {
  // This is continually called to maintain the background server.
  if (!nvrgtr_page.instance_closed) {
    $.ajax({
      url: daemonURL('/maintain-server'),
      type: 'POST',
      data: {'session_id': nvrgtr_page.session_id, 'browser_id': nvrgtr_page.browser_id},
      error: function(error) {
        console.log('connection to NaVARgator server lost. The error:', error);
        nvrgtr_page.instance_closed = true;
        clearInterval(nvrgtr_page.maintain_interval_obj);
      }
    });
  }
}
function closeInstance() {
  nvrgtr_page.instance_closed = true;
  clearInterval(nvrgtr_page.maintain_interval_obj);
  $.ajax({
    url: daemonURL('/instance-closed'),
    type: 'POST',
    data: {'session_id': nvrgtr_page.session_id, 'browser_id': nvrgtr_page.browser_id},
    async: false, // Makes a huge difference ensuring that this ajax call actually happens
    error: function(error) {
      console.log("Error closing your instance:");
      console.log(error);
    }
  });
}

// =====  Functions to calculate and warn about colour choices:
function calculateTransparentComplement(desired_col, opacity, background_col) {
  // If returned.closest_colour == '', then returned.trans_comp is what the colour should be set to in order to achieve the desired colour, given the current cluster_opacity and tree_background. Otherwise, it is not possible to recreate that desired colour with the given background and transparency. In that case closest_colour is the best we can do with the given transparency; returned.min_transparency is what the current transparency should be raised to in order to display desired_col.
  var de_r = parseInt('0x'+desired_col.slice(1,3)),
    de_g = parseInt('0x'+desired_col.slice(3,5)),
    de_b = parseInt('0x'+desired_col.slice(5,7));
  var bg_r = parseInt('0x'+background_col.slice(1,3)),
    bg_g = parseInt('0x'+background_col.slice(3,5)),
    bg_b = parseInt('0x'+background_col.slice(5,7));
  ret = {
    'r': roundFloat((de_r - bg_r*(1-opacity)) / opacity, 0),
    'g': roundFloat((de_g - bg_g*(1-opacity)) / opacity, 0),
    'b': roundFloat((de_b - bg_b*(1-opacity)) / opacity, 0),
    'closest_colour': '', 'min_transparency': 0.0
  };
  ret.trans_comp = colourStringFromRGB(ret.r, ret.g, ret.b);
  var min_trans = Math.max(calculateMinimumTransparency(ret.r, de_r, bg_r), calculateMinimumTransparency(ret.g, de_g, bg_g), calculateMinimumTransparency(ret.b, de_b, bg_b));
  if (min_trans > 0) {
    ret.min_transparency = min_trans;
    var new_r = Math.min(Math.max(ret.r, 0), 255),
      new_g = Math.min(Math.max(ret.g, 0), 255),
      new_b = Math.min(Math.max(ret.b, 0), 255);
    ret.closest_colour = colourStringFromRGB(new_r, new_g, new_b);
  }
  return ret;
}
function colourStringFromRGB(r, g, b) {
  var r_str = (r < 16) ? '0'+r.toString(16) : r.toString(16),
    g_str = (g < 16) ? '0'+g.toString(16) : g.toString(16),
    b_str = (b < 16) ? '0'+b.toString(16) : b.toString(16);
  return '#' + r_str + g_str + b_str;
}
function calculateMinimumTransparency(initial_val, desired_val, background_val) {
  // Returns 0 if the desired_val can be made from the current transparency and background_val, otherwise returns the smallest value that the transparency would have to be set to in order to make desired_val.
  // These equations come from: desired_val = initial_val*opacity + background_val*(1-opacity).
  var min_trans = 0;
  if (initial_val < 0) {
    min_trans = 1 - desired_val/background_val;
  } else if (initial_val > 255) {
    min_trans = (desired_val - background_val) / (255 - background_val);
  }
  return min_trans;
}

// =====  Misc common functions:
function roundFloat(num, num_dec) {
  var x = Math.pow(10, num_dec);
  return Math.round(num * x) / x;
}
function parseFileSuffix(filename) {
  // Taken from https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript
  var file_parts = filename.split(".");
  if ( file_parts.length === 1 || (file_parts[0] === "" && file_parts.length === 2) ) {
    return "";
  }
  return file_parts.pop().toLowerCase();
}
function calculate90Percentile(orig_var_names) {
  if (orig_var_names.length == 1) {
    return 0.0;
  }
  var var_names = orig_var_names.slice();
  var_names.sort(function(a, b) {
    return nvrgtr_data.variant_distance[a] - nvrgtr_data.variant_distance[b];
  });
  var ind = roundFloat(var_names.length * 0.9, 0) - 1;
  return nvrgtr_data.variant_distance[var_names[ind]];
}
function saveDataString(data_str, file_name, file_type) {
  // Uses javascript to save the string as a file to the client's download directory. This method works for >1MB svg files, for which other methods failed on Chrome.
  var data_blob = new Blob([data_str], {type:file_type});
  var data_url = URL.createObjectURL(data_blob);
  var download_link = document.createElement("a");
  download_link.href = data_url;
  download_link.download = file_name;
  document.body.appendChild(download_link);
  download_link.click();
  document.body.removeChild(download_link);
}
function calculateHistoTicks(max_var_dist) {
  // Given the current settings on the page, this calculates the ticks that would be used in the histogram on results.js.
  // The upper bound of each bin is not inclusive.
  var x_fxn = d3.scaleLinear().domain([0, max_var_dist]);
  var x_ticks = x_fxn.ticks(nvrgtr_settings.graph.histo_bins);
  if (max_var_dist >= x_ticks[x_ticks.length-1]) {
    x_ticks.push(x_ticks[x_ticks.length-1] + x_ticks[1]);
  }
  x_ticks.unshift(-x_ticks[1]); // Provides the space for the 'chosen' bar.
  return x_ticks;
}

function validateSpinner(spinner, description) {
  // Currently only used by input.js
  if (spinner.spinner("isValid")) {
    return true;
  } else {
    var min = spinner.spinner("option", "min"),
        max = spinner.spinner("option", "max"),
        step = spinner.spinner("option", "step"), msg;
    if (max) { msg = description+" must be between "+min+" and "+max; }
    else { msg = description+" must be greater than "+min; }
    if (step == 1) { msg = msg+", and be an integer value."; }
    else { msg = msg+", and be a multiple of "+step+"."; }
    showErrorPopup(msg, "Parameter error");
    return false;
  }
}
