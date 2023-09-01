// NOTE:
// - If I want a "real" draggable icon, can make one in pure CSS similar to https://codepen.io/citylims/pen/ogEoXe

// TODO:
// - Need a way to save nvrgtr session files from the Results page too.

// - Move result normalization to be by the graph.
// - Change "select by names" to match paradigm in variant distances: get rid of the validate button; the "submit" button alerts if names aren't found (and which) but doesn't proceed; add button to "remove invalid"

// - Want to change how selection groups behave. Don't like that you have to press "save" after making every change, should save changes semi-intelligently in real time.
//   - Also currently buggy when clicking one SG then a second one. Maybe have an "active" SG? So all edits are auto saved as long as it's "active"? Could also allow a second SG to be clicked without deactivating the first, allowing the choice of selection of the first SG to be modified.
// - Stress test fitSigmoidCurve(), especially if the y-values are logarithmic, or if there are data from 2 curves.
// - Finish updateClusterTransColour(key, colour); need to inform the user when a colour can't be made.
// - Many of the opts.colours should be pulled from core.css.
// - Ensure error codes in processError() match with error codes in navargator_daemon.py.

// =====  Common options and parameters
var nvrgtr_page = {
  'server_url':null, 'session_id':'', 'browser_id':'', 'instance_closed':false, 'maintain_interval':2000, 'maintain_interval_obj':null, 'min_tree_div_width':500, 'max_upload_size':20000000
};
var last_slash = window.location.href.lastIndexOf('/');
if (last_slash > 0) {
  nvrgtr_page.server_url = window.location.href.substring(0, last_slash);
} else {
  showErrorPopup('Error: could not determine the base of the current URL.');
}
var nvrgtr_data = { // Variables used by each page.
  'leaves':[], 'ordered_names':[], 'chosen':[], 'available':[], 'ignored':[], 'search_results':[], 'selected':new Set(), 'num_selected':0, 'allow_select':true, 'last_selected':null, 'last_was_select':true, 'considered_variants':{}, 'selection_groups':new Map(), 'banner_labels':[], 'lc_leaves':{}, 'tree_data':null, 'nodes':{}, 'tree_background':null, 'file_name':'unknown file', 'figure_svg_height':null, 'banner_legend_height':0, 'max_root_distance':0.0, 'max_root_pixels':0.0, 'r_paper':null, 'pan_zoom':null, 'banner_legend_paper':null
};
var nvrgtr_settings = { // Page-specific settings, not user-modifiable.
  'graph' : {
    'histo_bins':15, 'total_width':null, 'total_height':null
  },
  'banner_legend':{
    'bl_top_margin':10, 'header_font_size':18, 'header_top_margin':15, 'header_bot_margin':3, 'marker_width':8, 'marker_left_margin':10, 'marker_label_margin':8, 'label_font_size':12, 'label_y_margin':5, 'group_x_margin':15
  }
};
var nvrgtr_default_display_opts = { // User-modifiable settings that persist between pages and sessions. Anything with a value of null cannot be set by the user.
  'fonts' : {
    'tree_font_size':13, 'banner_font_size':15, 'family':'Helvetica, Arial, sans-serif'
  },
  'sizes' : {
    'tree':700, 'max_variant_name_length':15, 'scale_bar_distance':0.0, 'small_marker_radius':2, 'big_marker_radius':3, 'bar_chart_height':30, 'labels_outline':0.5, 'cluster_expand':4, 'cluster_smooth':0.75, 'inner_label_buffer':5, 'bar_chart_buffer':2, 'search_buffer':7, 'banner_borders':0.5, 'banner_height':15, 'banner_buffer':2
  },
  'show' : {
    'assigned_legend':false, 'chosen_beams':true, 'scalebar':true, 'banner_labels':true, 'banner_borders':true, 'banner_legend':false
  },
  'labels' : {
    'banner_names':[]
  },
  'angles' : {
    'init_angle':180, 'buffer_angle':20
  },
  'colours' : {
    'default_node':'#E8E8E8', 'chosen':'#24F030', 'available':'#2491AB', 'ignored':'#5D5D5D', 'label_bg':'#FFFFFF', 'label_text':'#3B3B3B', 'search':'#B19BEA', 'cluster_outline':'#000000', 'cluster_background':'#EAFEEC', 'cluster_highlight':'#92F7E4', 'singleton_cluster_background':'#9624F0', 'selection':'#FAB728', 'bar_chart':'#1B676B', 'tree_background':'#FFFFFF', 'cluster_opacity':0.43, 'cluster_background_trans':null, 'cluster_highlight_trans':null
  }
};
var nvrgtr_display_opts = $.extend(true, {}, nvrgtr_default_display_opts); // Deep copy

// =====  Convenience and error handling:
function showErrorPopup(message, title) {
  $("#errorDialogText").text(message);
  if (!title) {
    title = "Navargator error";
  }
  $("#errorDialog").dialog("option", "title", title);
  $("#errorDialog").dialog("open");
}
function processError(error, message) {
  console.log('Error occurred with message "'+message+'". The error object:');
  console.log(error);
  if (error.status == 559) {
    showErrorPopup(message+", as the server didn't recognize the given session ID. This generally means your session has timed out.");
  } else if (error.status == 0) {
    showErrorPopup(message+", as no response was received. This generally means the program has stopped or the web server is down.");
  } else if (error.status == 5505) {
    showErrorPopup(message+"; something went wrong uploading the data.");
  } else if (error.status == 5510) {
    showErrorPopup(message+"; the file format was malformed and could not be parsed.");
  } else if (error.status == 5511) {
    showErrorPopup(message+"; "+error.responseText);
  } else if (error.status == 5512) {
    showErrorPopup(message+"; "+error.responseText);
  } else if (error.status == 5513) {
    showErrorPopup(message+"; "+error.responseText);
  } else if (error.status == 5514) {
    showErrorPopup(message+"; "+error.responseText);
  } else {
    showErrorPopup(message+"; the server returned code "+error.status);
  }
}

// =====  Common functional elements:
function initializeButtons() {
  // Standardizes appearances across browsers, and provides some additional functionality to various elements.
  $(".jq-ui-button").button(); // Converts html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  // Sets up my custom checkboxes and radio buttons:
  $(".nvrgtr-checkbox-outer").addClass("prevent-text-selection").children("input[type=checkbox] + label.nvrgtr-checkbox-label").after("<span class='nvrgtr-checkbox'></span>");
  $(".nvrgtr-checkbox-outer").children("input[type=radio] + label.nvrgtr-checkbox-label").after("<span class='nvrgtr-radio-checkbox'></span>");
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
function initializeHelpButtons() {
  // This must be called before initializeFloatingPanes()
  $(".help-button").text("?");
  $(".help-button").addClass("prevent-text-selection");
  $(".help-button").each(function() {
    $(this).append('<div class="floating-pane"><div><h2 class="floating-pane-header">Help dialog</h2><button class="floating-pane-close"></button></div><div class="help-text-div"></div></div>');
  });
  $(".help-button").click(function() {
    showFloatingPane($(this).children().first());
    return false;
  });
  setupCoreHelpButtonText(); // Defined here for elements common to pages
  setupSpecificHelpButtonText(); // Defined in each page's JS
}
function initializeFloatingPanes() {
  // This must be called after initializeHelpButtons()
  $(".floating-pane-header").addClass("prevent-text-selection");
  $(".floating-pane-close").each(function() {
    $(this).append('<span class="floating-pane-close-span1">');
    $(this).append('<span class="floating-pane-close-span2">');
    var pane = $(this).parent().parent();
    $(this).click(function() {
      // Minimizes the pane and resets the positioning, in case the user changes the screen size or moves elements
      let new_css = {'maxWidth':'0px', 'maxHeight':'0px', 'outline-width':'0px', 'translate':'none'};
      pane.css(new_css);
      return false;
    });
  });
}
function showFloatingPane(pane) {
  // Makes the pane visible and dynamically ensures the pane will not be pushed off-screen. Pane elements should contain the attribute 'expandanchor' which indicates how the pane will expand; should be ('t' or 'b' or neither) and ('l' or 'r' or neither). 'tl' means the top left corner stays put and the pane expands down and right, 'r' means the right side stays put and the pane expands left and up and down. 'tl' is the default if nothing is specified. This doesn't set the actual positioning, but is used to prevent going off-screen.
  let edge_margin = 5; // Minimum space between pane and screen edges
  let pane_width = pane[0].scrollWidth, pane_height = pane[0].scrollHeight, outline_width = getComputedStyle(document.documentElement).getPropertyValue('--control-element-border-width');
  let new_css = {'maxWidth':pane_width+'px', 'maxHeight':pane_height+'px', 'outline-width':outline_width};
  // At runtime, pane.offset().left is the left of the invisible pane. If left-justified it will be the left side of parent, if right-justified it will be the right side of the parent. It does not account for the width of the pane.
  // Likewise, pane.offset().top is the top of the invisible pane, placed either at the top or bottom of the parent, if top- or bottom-justified, respectively.
  let pane_offset = pane.offset(), pane_left = pane_offset.left, pane_top = pane_offset.top, screen_left = edge_margin, screen_right = $(document).width() - edge_margin, screen_top = edge_margin, screen_bottom = $(document).height() - edge_margin, pane_right, pane_bottom;
  // Calculate the new coordinates of the pane after being expanded:
  var expand_anchor = pane.attr('expandanchor') || 'tl';
  if (expand_anchor.includes('l')) {
    pane_right = pane_left + pane_width;
  } else if (expand_anchor.includes('r')) {
    pane_right = pane_left, pane_left -= pane_width;
  } else {
    pane_left -= pane_width/2, pane_right = pane_left + pane_width;
  }
  if (expand_anchor.includes('t')) {
    pane_bottom = pane_top + pane_height;
  } else if (expand_anchor.includes('b')) {
    pane_bottom = pane_top, pane_top -= pane_height;
  } else {
    pane_top -= pane_height/2, pane_bottom = pane_top + pane_height;
  }
  // Calculate any translations required to keep the pane visible:
  let x_trans = 0, y_trans = 0;
  if (pane_left < screen_left) {
    x_trans = screen_left - pane_left;
  } else if (pane_right > screen_right) {
    x_trans = Math.max(screen_left - pane_left, screen_right - pane_right);
  }
  if (pane_top < screen_top) {
    y_trans = screen_top - pane_top;
  } else if (pane_bottom > screen_bottom) {
    y_trans = Math.max(screen_top - pane_top, screen_bottom - pane_bottom);
  }
  // Add translation to the css call if needed:
  if (x_trans != 0 || y_trans != 0) {
    new_css['translate'] = x_trans+'px '+y_trans+'px';
  }
  pane.css(new_css);
}
function setupDisplayOptionsPane() {
  $("#displayTreeFontSizeSpinner").spinner({
    min: 0, max: 48,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.fonts.tree_font_size = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.fonts.tree_font_size = parseInt(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.fonts.tree_font_size);
  $("#displayTreeWidthSpinner").spinner({
    min: 100, max: 10000,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.sizes.tree = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.sizes.tree = parseInt(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.sizes.tree);
  $("#displayTreeBigNodeSpinner").spinner({
    min: 0, max: 10,
    numberFormat: 'N1', step: 0.5,
    spin: function(event, ui) {
      nvrgtr_display_opts.sizes.big_marker_radius = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.sizes.big_marker_radius = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.sizes.big_marker_radius);
  $("#displayTreeSmallNodeSpinner").spinner({
    min: 0, max: 10,
    numberFormat: 'N1', step: 0.5,
    spin: function(event, ui) {
      nvrgtr_display_opts.sizes.small_marker_radius = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.sizes.small_marker_radius = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.sizes.small_marker_radius);
  $("#displayTreeBarChartSizeSpinner").spinner({
    min: 0, max: 500,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.sizes.bar_chart_height = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.sizes.bar_chart_height = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.sizes.bar_chart_height);
  $("#displayTreeLabelOutlineSpinner").spinner({
    min: 0, max: 10,
    numberFormat: 'N1', step: 0.1,
    spin: function(event, ui) {
      nvrgtr_display_opts.sizes.labels_outline = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.sizes.labels_outline = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.sizes.labels_outline);
  $("#displayTreeInitAngleSpinner").spinner({
    min: 0, max: 359,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.angles.init_angle = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.angles.init_angle = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.angles.init_angle);
  $("#displayTreeBufferAngleSpinner").spinner({
    min: 0, max: 359,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.angles.buffer_angle = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.angles.buffer_angle = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.angles.buffer_angle);
  $("#displayBannerHeightSpinner").spinner({
    min: 0,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.sizes.banner_height = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.sizes.banner_height = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.sizes.banner_height);
  $("#displayBannerBufferSpinner").spinner({
    min: 0,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.sizes.banner_buffer = ui.value;
    },
    change: function(event, ui) {
      nvrgtr_display_opts.sizes.banner_buffer = parseFloat(this.value);
    }
  }).spinner('value', nvrgtr_display_opts.sizes.banner_buffer);
  $("#displayBannerFontSpinner").spinner({
    min: 0,
    numberFormat: 'N0', step: 1,
    spin: function(event, ui) {
      nvrgtr_display_opts.fonts.banner_font_size = ui.value;
      for (const label_ele of nvrgtr_data.banner_labels) {
        label_ele.attr('font-size', nvrgtr_display_opts.fonts.banner_font_size);
      }
    },
    change: function(event, ui) {
      nvrgtr_display_opts.fonts.banner_font_size = parseFloat(this.value);
      for (const label_ele of nvrgtr_data.banner_labels) {
        label_ele.attr('font-size', nvrgtr_display_opts.fonts.banner_font_size);
      }
    }
  }).spinner('value', nvrgtr_display_opts.fonts.banner_font_size);
  $("#displayBannerLabelCheckbox").change(function() {
    if ($("#displayBannerLabelCheckbox").is(':checked')) {
      nvrgtr_display_opts.show.banner_labels = true;
      for (const label_ele of nvrgtr_data.banner_labels) {
        label_ele.show();
      }
    } else {
      nvrgtr_display_opts.show.banner_labels = false;
      for (const label_ele of nvrgtr_data.banner_labels) {
        label_ele.hide();
      }
    }
  });
  $("#displayBannerBorderCheckbox").change(function() {
    if ($("#displayBannerBorderCheckbox").is(':checked')) {
      nvrgtr_display_opts.show.banner_borders = true;
      if (nvrgtr_display_opts.labels.banner_names.length > 0) {
        for (var_name in nvrgtr_data.nodes) {
          for (let i=0; i<nvrgtr_data.nodes[var_name].banners.length; ++i) {
            nvrgtr_data.nodes[var_name].banners[i].attr('stroke-width', nvrgtr_display_opts.sizes.banner_borders);
          }
        }
      }
    } else {
      nvrgtr_display_opts.show.banner_borders = false;
      if (nvrgtr_display_opts.labels.banner_names.length > 0) {
        for (var_name in nvrgtr_data.nodes) {
          for (let i=0; i<nvrgtr_data.nodes[var_name].banners.length; ++i) {
            nvrgtr_data.nodes[var_name].banners[i].attr('stroke-width', 0);
          }
        }
      }
    }
  });
  $("#showLegendCheckbox").change(function() {
    if ($("#showLegendCheckbox").is(':checked')) {
      nvrgtr_display_opts.show.assigned_legend = true;
      $("#treeLegendLeftGroup").show();
    } else {
      nvrgtr_display_opts.show.assigned_legend = false;
      $("#treeLegendLeftGroup").hide();
    }
  });
  $("#showChosenBeamsCheckbox").change(function() {
    if ($("#showChosenBeamsCheckbox").is(':checked')) {
      nvrgtr_display_opts.show.chosen_beams = true;
      if (nvrgtr_page.page == 'results') {
        for (let i=0; i<nvrgtr_data.variants.length; ++i) {
          nvrgtr_data.nodes[nvrgtr_data.variants[i]].search_highlight.attr({'fill':nvrgtr_display_opts.colours.chosen, 'stroke':nvrgtr_display_opts.colours.chosen});
          nvrgtr_data.nodes[nvrgtr_data.variants[i]].search_highlight.show();
        }
      }
    } else {
      nvrgtr_display_opts.show.chosen_beams = false;
      if (nvrgtr_page.page == 'results') {
        for (let i=0; i<nvrgtr_data.variants.length; ++i) {
          nvrgtr_data.nodes[nvrgtr_data.variants[i]].search_highlight.attr({'fill':nvrgtr_display_opts.colours.search, 'stroke':nvrgtr_display_opts.colours.search});
          nvrgtr_data.nodes[nvrgtr_data.variants[i]].search_highlight.hide();
        }
      }
    }
  });
  $("#showScaleBarCheckbox").change(function() {
    if ($("#showScaleBarCheckbox").is(':checked')) {
      nvrgtr_display_opts.show.scalebar = true;
      $("#treeScaleBarGroup").show();
    } else {
      nvrgtr_display_opts.show.scalebar = false;
      $("#treeScaleBarGroup").hide();
    }
  });
  var sb_button_shown = false, sb_input = $("#scaleBarInput"), sb_go_button = $("#scaleBarInputGoButton");
  sb_input.data('prev_val', '');
  function showSbGoButton() {
    if (sb_button_shown == false) {
      sb_go_button.show(100);
      sb_button_shown = true;
    }
  }
  function hideSbGoButton() {
    if (sb_button_shown == true) {
      sb_go_button.hide(100);
      sb_button_shown = false;
    }
  }
  sb_input.on("keydown", function(event) {
    if (event.which == 13) { // 'Enter' key
      sb_input.blur();
      sb_go_button.click();
      return false;
    }
    showSbGoButton();
  }).blur(function(event) {
    var val = parseFloat(sb_input.val());
    if (isNaN(val)) {
      val = '';
    }
    sb_input.val(val);
    if (val == sb_input.data('prev_val')) {
      hideSbGoButton();
    }
  });
  sb_go_button.click(function(event) {
    var val = sb_input.val();
    if (val != '' && val < 0) {
      showErrorPopup("Error: the scale bar value must be a positive number.");
      sb_input.val(sb_input.data('prev_val'));
      return false;
    }
    hideSbGoButton();
    sb_input.data('prev_val', updateScaleBar(val));
    $("#showScaleBarCheckbox").prop('checked', true).change();
  });

  $("#resetDisplayOptsButton").click(function() {
    // Does not reset the banner names or number of banners.
    var blank_display_opts = $.extend(true, {}, nvrgtr_default_display_opts); // Deep copy
    blank_display_opts.labels.banner_names = nvrgtr_display_opts.labels.banner_names;
    processDisplayOptions(blank_display_opts);
    applyAllSelectionGroupFormats();
  });
  $("#redrawTreeButton").click(function() {
    // Clear any selection
    $("#clearSelectionButton").click();
    // Reset the tree view
    $("#treeZoomResetButton").click();
    // Clear any searches
    $("#varSearchInput").val('');
    $("#varSearchButton").click();
    treeIsLoading();
    redrawTree();
  });
  $("#redrawTreeButton").button('disable');
  $("#showLegendCheckbox").prop('disabled', true);
  $("#showScaleBarCheckbox").prop('disabled', true);
}
function setupSelectionGroupsPane() {
  var sg_banner_num = 1;
  $("#selectGroupAddBannerButton").click(function() {
    let banner_name = 'Banner '+sg_banner_num;
    // Update the backend data structures
    nvrgtr_display_opts.labels.banner_names.push(banner_name);
    for (const [group_name, group_data] of nvrgtr_data.selection_groups.entries()) {
      group_data.banner_colours.push(null); // null means no colour will be set
    }
    // Add and update the HTML
    addBannerFormatElements(banner_name);
    $("#bannerLegendDiv").show(); // Show if not already visible
    $("#redrawTreeButton").click(); // Adds the text object to nvrgtr_data.banner_labels
    $("#selectionGroupsDiv").css('maxHeight', $("#selectionGroupsDiv")[0].scrollHeight+"px");
    sg_banner_num += 1;
  });
  var banner_old_index;
  $("#selectGroupBannerListDiv").sortable({
    start: function(event, ui) {
      banner_old_index = nvrgtr_data.banner_labels.length - ui.item.index() - 1;
    },
    update: function(event, ui) { // Updates the backend
      let banner_new_index = nvrgtr_data.banner_labels.length - ui.item.index() - 1;
      // Names of the banners
      let temp_name = nvrgtr_display_opts.labels.banner_names.splice(banner_old_index, 1)[0];
      nvrgtr_display_opts.labels.banner_names.splice(banner_new_index, 0, temp_name);
      // Update the banner labels
      for (let i=0; i<nvrgtr_data.banner_labels.length; i++) {
        nvrgtr_data.banner_labels[i].attr('text', nvrgtr_display_opts.labels.banner_names[i]);
      }
      // Selection group banner colours
      for (let format of nvrgtr_data.selection_groups.values()) {
        let temp_colour = format.banner_colours.splice(banner_old_index, 1)[0];
        format.banner_colours.splice(banner_new_index, 0, temp_colour);
      }
      // Updates the colour of the banner segment for each variant
      $.each(nvrgtr_data.nodes, function(name, node) {
        let ban_cols = node.banners.map(function(obj) {
          return obj.attr('fill')
        });
        let temp_col = ban_cols.splice(banner_old_index, 1)[0];
        ban_cols.splice(banner_new_index, 0, temp_col);
        for (let i=0; i<ban_cols.length; i++) {
          node.banners[i].attr({fill: ban_cols[i]});
        }
      });
    }
  });
  $("#bannerLegendDiv").hide();
  $("#selectGroupBannerLegendButton").click(function() {
    if (nvrgtr_display_opts.labels.banner_names.length == 0) {
      showErrorPopup("Error: cannot generate the banner legend without any defined banners.");
      return;
    }
    if (nvrgtr_data.selection_groups.size == 0) {
      showErrorPopup("Error: cannot generate the banner legend without any defined selection groups.");
      return;
    }
    drawBannerLegend();
  });
  $("#showBannerLegendCheckbox").change(function() {
    if ($("#showBannerLegendCheckbox").is(':checked')) {
      nvrgtr_display_opts.show.banner_legend = true;
      $("#treeBannerLegendGroup").show();
      $("#figureSvg").attr({'height':nvrgtr_data.figure_svg_height + nvrgtr_data.banner_legend_height + nvrgtr_settings.banner_legend.bl_top_margin + 2}); // The 2 accounts for the borders
      // show the svg. may have to resize the treediv itself; we'll see.
    } else {
      nvrgtr_display_opts.show.banner_legend = false;
      $("#treeBannerLegendGroup").hide();
      $("#figureSvg").attr({'height':nvrgtr_data.figure_svg_height});
    }
  }).prop('disabled', true);
  $("#selectGroupApplyButton").click(function() {
    applySelectionGroupFormat();
  });
  $("#selectGroupClearFormatButton").click(function() {
    applySelectionGroupFormat(true);
    $("#node_colourPicker")[0].jscolor.fromString('#FFFFFF');
    $("#node_colourPicker").val('');
    $("#label_colourPicker")[0].jscolor.fromString('#FFFFFF');
    $("#label_colourPicker").val('');
    $("#text_colourPicker")[0].jscolor.fromString('#FFFFFF');
    $("#text_colourPicker").val('');
    $("#selectGroupNodeSizeSpinner").val('');
    $("#selectGroupNameInput").val('');
    $("#selectGroupBannerListDiv > .select-group-banner-div > .jscolor").each(function() {
      this.jscolor.fromString('#FFFFFF');
      $(this).val('');
    });
  });
  $("#node_colourPicker").keydown(function(event) {
    if (event.which == 13) {
      updateSelectionGroupColour('node');
      this.jscolor.hide();
    }
  });
  $("#label_colourPicker").keydown(function(event) {
    if (event.which == 13) {
      updateSelectionGroupColour('label');
      this.jscolor.hide();
    }
  });
  $("#text_colourPicker").keydown(function(event) {
    if (event.which == 13) {
      updateSelectionGroupColour('text');
      this.jscolor.hide();
    }
  });
  $("#selectGroupNodeSizeSpinner").spinner({
    min: 0, numberFormat: 'N1', step: 0.5,
    change: function(event, ui) {
      updateSelectionGroupNodeSize(parseFloat(this.value));
    }
  });
  $("#selectGroupNodeSizeSpinner").keydown(function(event) {
    if (event.which == 13) {
      updateSelectionGroupNodeSize(parseFloat(this.value));
    }
  });
  var sg_old_index;
  $("#selectGroupListDiv").sortable({
    start: function(event, ui) {
      sg_old_index = ui.item.index();
    },
    update: function(event, ui) {
      let sg_new_index = ui.item.index();
      // Re-order the nvrgtr_data.selection_groups with a new Map object
      let sg_order = [...nvrgtr_data.selection_groups.keys()];
      let temp_sg_name = sg_order.splice(sg_old_index, 1)[0];
      sg_order.splice(sg_new_index, 0, temp_sg_name);
      let new_sg_map = new Map();
      for (let i=0; i<sg_order.length; i++) {
        new_sg_map.set(sg_order[i], nvrgtr_data.selection_groups.get(sg_order[i]));
      }
      nvrgtr_data.selection_groups = new_sg_map;
    }
  });
  $("#selectGroupNameInput").keydown(function(event) {
    if (event.which == 13) {
      $("#selectGroupSaveButton").click();
    }
  });
  var select_group_int = 1; // For unnamed groups
  $("#selectGroupSaveButton").click(function() {
    var group_name = $.trim($("#selectGroupNameInput").val());
    if (group_name == '') {
      while (nvrgtr_data.selection_groups.has('Group_' + select_group_int)) {
        select_group_int += 1;
      }
      group_name = 'Group_' + select_group_int;
    }
    addNewSelectionGroup(group_name, null, true);
    $("#selectionGroupsDiv").css('maxHeight', $("#selectionGroupsDiv")[0].scrollHeight+"px");
  });
}

function setupDistancesPanes() {
  // Selected distances pane
  var variant_distances_text = $("#variantDistancesText");
  $("#getSelectedDistancesButton").click(function() {
    if (nvrgtr_data.selected.size <= 1) {
      showErrorPopup("Error: you must select 2 or more variants. Returns the distance from the first variant selected to every other.");
      return;
    }
    let selected_vars = [...nvrgtr_data.selected];
    $.ajax({
      url: daemonURL('/get-distances'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageBasicData(), 'selected_vars':selected_vars}),
      success: function(data_obj) {
        let data = $.parseJSON(data_obj);
        $("#variantDistanceFromSpan").text(selected_vars[0]);
        $("#variantDistanceToSpan").text(selected_vars.slice(1).join(', '));
        variant_distances_text.data('raw_distances', data.distances);
        formatDistancesPaneText();
        if (data.distances.length > 1) {
          let dist_avg = data.distances.reduce((a,b) => a + b, 0) / data.distances.length;
          $("#variantDistanceAvgP").show();
          $("#variantDistanceAvgSpan").text(dist_avg.toPrecision(4));
        } else {
          $("#variantDistanceAvgP").hide();
        }
        showFloatingPane($("#variantDistancesPane"));
      },
      error: function(error) { processError(error, "Error retrieving variant distances"); }
    });
  });
  $("#variantDistancesDelimiterSelect").change(function() {
    formatDistancesPaneText();
  });
  $("#variantDistancesCopyButton").click(function() {
    variant_distances_text.select();
    navigator.clipboard.writeText(variant_distances_text.val());
  });
  $("#variantDistancesSaveButton").click(function() {
    let text_data = variant_distances_text.val();
    downloadData('navargator_distances.txt', text_data, "text/plain");
  });
  // Pairwise distances pane
  var pair_input_text = $("#pairwiseDistancesVariantText"), pair_output_text = $("#pairwiseDistancesOutputText");
  function validatePairwiseVariants() {
    let var_delim = $("#pairwiseDistancesVariantDelimiter").val(), variant_lines = $.trim(pair_input_text.val()).split('\n');
    let valid_pairs = [], err_msg = '', variant_line, line_variants, variant1, variant2;
    if (!variant_lines[0]) {
      err_msg = "Error: no valid variants. To get pairwise distances, enter two variant names per line separated by the indicated delimiter character.";
      return [[], err_msg];
    }
    for (let i=0; i<variant_lines.length; ++i) {
      variant_line = $.trim(variant_lines[i]);
      line_variants = variant_line.split(var_delim);
      if (line_variants.length != 2) {
        err_msg = err_msg || "Error: cannot parse line '"+variant_line+"'. It should contain two variant names separated by the 'Variant delimiter' character. Ensure the delimiter is not found in the variant names.";
        continue;
      }
      variant1 = line_variants[0], variant2 = line_variants[1];
      if (!nvrgtr_data.leaves.includes(variant1)) {
        err_msg = err_msg || "Error: variant '"+variant1+"' was not found in the tree.";
        continue;
      } else if (!nvrgtr_data.leaves.includes(variant2)) {
        err_msg = err_msg || "Error: variant '"+variant2+"' was not found in the tree.";
        continue;
      } else {
        valid_pairs.push([variant1, variant2]);
      }
    }
    return [valid_pairs, err_msg];
  }
  $("#getPairwiseDistancesButton").click(function() {
    showFloatingPane($("#pairwiseDistancesPane"));
  });
  $("#pairwiseDistancesFilterButton").click(function() {
    let ret = validatePairwiseVariants(), variant_pairs = ret[0];
    let var_delim = $("#pairwiseDistancesVariantDelimiter").val(), valid_pairs = [];
    for (let i=0; i<variant_pairs.length; ++i) {
      valid_pairs.push(variant_pairs[i].join(var_delim));
    }
    pair_input_text.val(valid_pairs.join('\n'));
  });
  $("#pairwiseDistancesGetButton").click(function() {
    let ret = validatePairwiseVariants(), variant_pairs = ret[0], err_msg = ret[1];
    if (err_msg) {
      showErrorPopup(err_msg);
      return;
    }
    
    $.ajax({
      url: daemonURL('/get-pairwise-distances'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageBasicData(), 'variant_pairs':variant_pairs}),
      success: function(data_obj) {
        let data = $.parseJSON(data_obj);
        pair_output_text.data('raw_distances', data.distances);
        formatPairwiseDistancesPaneText();
      },
      error: function(error) { processError(error, "Error retrieving pairwise distances"); }
    });
    
  });
  
}
function formatDistancesPaneText() {
  let vd_text = $("#variantDistancesText"), delimiter = $("#variantDistancesDelimiterSelect").val();
  vd_text.text(vd_text.data('raw_distances').join(delimiter));
  vd_text.css('height', ''); // Need to unset before setting, otherwise it cannot shrink.
  vd_text.css('height', vd_text[0].scrollHeight+'px');
}
function formatPairwiseDistancesPaneText() {
  let pd_text = $("#pairwiseDistancesOutputText"), delimiter = $("#pairwiseDistancesOutputDelimiter").val();
  pd_text.text(pd_text.data('raw_distances').join(delimiter));
  pd_text.css('height', ''); // Need to unset before setting, otherwise it cannot shrink.
  pd_text.css('height', pd_text[0].scrollHeight+'px');
}

function drawBannerLegend() {
  // Get info and ensure it is valid
  let legend = nvrgtr_settings.banner_legend;
  let legend_groups = [];
  for (let i=0; i<nvrgtr_display_opts.labels.banner_names.length; i++) {
    legend_groups.push({'name':nvrgtr_display_opts.labels.banner_names[i], 'labels':[], 'colours':[]});
  }
  for (const [group_name, group_data] of nvrgtr_data.selection_groups.entries()) {
    let num_colours = group_data.banner_colours.filter(function(item){
        if (item != null) { return true; }
      }).length;
    if (num_colours != 1) {
      continue;
    }
    for (let i=0; i<group_data.banner_colours.length; i++) {
      if (group_data.banner_colours[i] != null) {
        legend_groups[i].labels.push(group_name);
        legend_groups[i].colours.push(group_data.banner_colours[i]);
      }
    }
  }
  // Removes entries for banners that have no saved selection group colours
  let legend_to_draw = legend_groups.filter(group => group.labels.length > 0);
  if (legend_to_draw.length == 0) {
    return;
  }
  // Get the paper object set up
  if (nvrgtr_data.banner_legend_paper == null) {
    nvrgtr_data.banner_legend_paper = new Raphael('treeBannerLegendGroup', 100, 100);
  } else {
    nvrgtr_data.banner_legend_paper.clear();
  }
  // Draw the legend object
  $("#treeBannerLegendGroup").show();
  let cur_x = 0, cur_y, legend_height = 0;
  let group_set, group_header, marker, text_x, group_label, group_set_bbox;
  for (const lg_data of legend_to_draw) {
    cur_y = legend.header_top_margin;
    text_x = cur_x+legend.marker_left_margin+legend.marker_label_margin;
    group_set = nvrgtr_data.banner_legend_paper.set();
    group_header = nvrgtr_data.banner_legend_paper.text(text_x, cur_y, lg_data.name)
      .attr({'font-size':legend.header_font_size, 'font-family':nvrgtr_display_opts.fonts.family, 'text-anchor':'start'});
    cur_y += group_header.getBBox().height + legend.header_bot_margin;
    group_set.push(group_header);
    for (let i=0; i<lg_data.labels.length; i++) {
      marker = nvrgtr_data.banner_legend_paper.rect(cur_x+legend.marker_left_margin-legend.marker_width/2, cur_y-legend.marker_width/2, legend.marker_width, legend.marker_width)
        .attr({'fill':lg_data.colours[i], 'stroke':'black', 'stroke-width':0.5});
      group_set.push(marker);
      group_label = nvrgtr_data.banner_legend_paper.text(text_x, cur_y, lg_data.labels[i])
        .attr({'font-size':legend.label_font_size, 'font-family':nvrgtr_display_opts.fonts.family, 'text-anchor':'start'});
      group_set.push(group_label);
      cur_y += group_label.getBBox().height + legend.label_y_margin;
    }
    group_set_bbox = group_set.getBBox();
    cur_x += group_set_bbox.width + legend.group_x_margin;
    legend_height = Math.max(legend_height, group_set_bbox.height);
  }
  // Draw box around legend
  legend_height += legend.header_top_margin - legend.label_y_margin;
  nvrgtr_data.banner_legend_paper.rect(1, 1, cur_x, legend_height)
    .attr({'fill':'#FFFFFF', 'stroke':'black', 'stroke-width':1})
    .toBack();
  nvrgtr_data.banner_legend_paper.setSize(cur_x + 2, legend_height + 2);
  $("#figureSvg").attr({'height':nvrgtr_data.figure_svg_height + legend_height + legend.bl_top_margin + 2}); // The 2 accounts for the borders
  $("#showBannerLegendCheckbox").prop('disabled', false).prop('checked', true);
  nvrgtr_display_opts.show.banner_legend = true;
  nvrgtr_data.banner_legend_height = legend_height;
}

// =====  Display option updating:
function parseBasicData(data_obj) {
  // Is always called before calling drawTree. Updates nvrgtr_default_display_opts based on the size of the given tree.
  var data = $.parseJSON(data_obj);
  if (nvrgtr_page.session_id != data.session_id) {
    changeSessionID(data.session_id);
  }
  nvrgtr_page.session_id = data.session_id;
  nvrgtr_data.tree_data = data.phyloxml_data;
  nvrgtr_data.leaves = data.leaves;
  nvrgtr_data.ordered_names = data.ordered_names;
  nvrgtr_data.lc_leaves = {}; // Lowercase names as keys, actual names as values. Used to search.
  var name;
  for (var i=0; i<data.leaves.length; ++i) {
    name = data.leaves[i];
    nvrgtr_data.lc_leaves[name.toLowerCase()] = name;
  }
  nvrgtr_data.available = data.available;
  nvrgtr_data.ignored = data.ignored;
  if (nvrgtr_page.page == 'input') {
    nvrgtr_data.chosen = data.chosen;
  }
  nvrgtr_data.file_name = data.file_name;
  nvrgtr_data.max_root_distance = data.max_root_distance;
  if (data.hasOwnProperty('maintain_interval') && data.maintain_interval*1000 != nvrgtr_page.maintain_interval) {
    maintainServer();
    nvrgtr_page.maintain_interval = data.maintain_interval * 1000;
    clearInterval(nvrgtr_page.maintain_interval_obj);
    nvrgtr_page.maintain_interval_obj = setInterval(maintainServer, nvrgtr_page.maintain_interval);
  }
  processDisplayOptions(data.display_opts);
  data.selection_groups_order.forEach(function(group_name) {
    addNewSelectionGroup(group_name, data.selection_groups_data[group_name], false);
  });
  $(".select-group-list-element").removeClass('select-group-list-element-active');
}
function processDisplayOptions(display_opts) {
  updateDisplayOptions(display_opts);
  $("#selectGroupBannerListDiv > .select-group-banner-div").remove();
  $.each(nvrgtr_display_opts.labels.banner_names, function(index, banner_name) {
    addBannerFormatElements(banner_name);
  });
  if (nvrgtr_display_opts.labels.banner_names.length > 0) {
    $("#bannerLegendDiv").show(); // Show if not already visible
  }
  setColourPickers();
  updateClusterColours();
  updateDisplayOptionSpinners();
  if (nvrgtr_display_opts.show.banner_labels == true) {
    $("#displayBannerLabelCheckbox").prop('checked', true).change();
  } else {
    $("#displayBannerLabelCheckbox").prop('checked', false).change();
  }
  if (nvrgtr_display_opts.show.banner_borders == true) {
    $("#displayBannerBorderCheckbox").prop('checked', true).change();
  } else {
    $("#displayBannerBorderCheckbox").prop('checked', false).change();
  }
  if (nvrgtr_display_opts.show.assigned_legend == true) {
    $("#showLegendCheckbox").prop('checked', true);
  } else {
    $("#showLegendCheckbox").prop('checked', false);
  }
  if (nvrgtr_display_opts.show.chosen_beams == true) {
    $("#showChosenBeamsCheckbox").prop('checked', true);
  } else {
    $("#showChosenBeamsCheckbox").prop('checked', false);
  }
  if (nvrgtr_display_opts.show.scalebar == true) {
    $("#showScaleBarCheckbox").prop('checked', true);
  } else {
    $("#showScaleBarCheckbox").prop('checked', false);
  }
}
function validateDisplayOption(category, key, new_val) {
  var value, is_valid,
    val_type = $.type(nvrgtr_default_display_opts[category][key]);
  if (val_type == 'number') {
    if (key == 'max_variant_name_length') {
      value = parseInt(new_val);
    } else {
      value = parseFloat(new_val);
    }
    is_valid = isFinite(value); // Also catches NaN, which means it couldn't convert.
  } else if (val_type == 'string') {
    value = new_val.trim(), is_valid = true;
    if (category == 'colours') {
      if (value[0] != '#' || value.length != 7) {
        is_valid = false;
      }
    }
  } else if (val_type == 'boolean') {
    // new_val will be a string (True/False) when opening a nvrgtr file, and will be boolean for results.js
    is_valid = true;
    if ($.type(new_val) == 'string') {
      if (new_val.toLowerCase() == 'true') {
        value = true;
      } else if (new_val.toLowerCase() == 'false') {
        value = false;
      } else {
        is_valid = false;
      }
    } else if ($.type(new_val) == 'boolean') {
      value = new_val;
    } else {
      is_valid = false;
    }
  } else if (val_type == 'null') {
    value = null;
    is_valid = true;
  } else if (val_type == 'array') {
    value = [...new_val]; // Copies the array
  }
  if (is_valid == false) {
    value = nvrgtr_default_display_opts[category][key];
  }
  return value;
}
function updateDisplayOptions(display_opts) {
  // Updates nvrgtr_display_opts. If an option is not present in the passed obj, the current value will be used. Any display options passed will be validated before being accepted.
  var new_opts = {}, new_val;
  $.each(nvrgtr_display_opts, function(category, opts) {
    if (category in display_opts) { // validate the passed options.
      new_opts[category] = {};
      $.each(opts, function(key, old_val) {
        if (key in display_opts[category]) {
          new_val = display_opts[category][key];
          new_opts[category][key] = validateDisplayOption(category, key, new_val);
        } else {
          new_opts[category][key] = old_val;
        }
      });
    } else { // set the whole category to default values.
      new_opts[category] = $.extend(true, {}, opts); // Does a deep copy
    }
  });
  nvrgtr_display_opts = new_opts;
}
function setColourPickers() {
  /*Updates the colour pickers to reflect the current values in nvrgtr_display_opts.colours*/
  //$("#element_ID")[0].jscolor.fromString('#aabbcc'); // Set colour
  //colour_str = '#' + $("#element_ID")[0].value; // Get colour
  var key_list = ['available', 'chosen', 'ignored', 'default_node', 'label_bg', 'label_text', 'cluster_background', 'singleton_cluster_background', 'cluster_highlight', 'bar_chart', 'selection', 'search', 'tree_background'];
  var key, colour, picker_id;
  for (var i=0; i<key_list.length; ++i) {
    key = key_list[i];
    colour = nvrgtr_display_opts.colours[key];
    picker_id = '#' + key + "_colourPicker";
    $(picker_id)[0].jscolor.fromString(colour);
    updateDisplayColour(key, $(picker_id)[0].jscolor);
  }
}
function updateDisplayColour(key, jscolor) {
  /*Called directly by the colour picker elements.*/
  var colour = '#' + jscolor;
  if (key in nvrgtr_display_opts.colours) {
    nvrgtr_display_opts.colours[key] = colour;
    if (['available', 'chosen', 'ignored', 'default_node', 'singleton_cluster_background'].indexOf(key) > -1) {
      updateVariantColours();
    } else if (['bar_chart', 'cluster_highlight', 'selection', 'search', 'label_bg', 'label_text'].indexOf(key) > -1) {
      updateLabelColours(key, colour);
    }
    if (['cluster_background', 'cluster_highlight'].indexOf(key) > -1) {
      // ^ This list must match that in updateClusterColours().
      updateClusterTransColour(key, colour);
    }
    if (key == 'tree_background' && nvrgtr_data.tree_background != null) {
      nvrgtr_data.tree_background.attr('fill', colour);
    }
  } else {
    showErrorPopup("Error setting colour; key '"+key+"' not recognized. Please report this issue on the Navargator github page.", "Navargator colour picker");
  }
}
function updateVariantColours() {
  var var_colour;
  $.each(nvrgtr_data.nodes, function(name, node) {
    var_colour = nvrgtr_display_opts.colours[node.node_rest_key];
    node.node_rest_colour = var_colour;
    if (!node.selected && !node.mouseover) {
      node.circle.attr({fill: var_colour});
    }
    if (node.label_mouseover_key == "chosen") {
      // Because these nodes use a different mouseover colour.
      node.label_mouseover_colour = nvrgtr_display_opts.colours.chosen;
    }
  });
  updateTreeLegend();
  updateVariantColoursFollowup();
}
function updateLabelColours(key, colour) {
  if (key == 'cluster_highlight') {
    document.documentElement.style.setProperty('--highlight-colour', colour);
  } else if (key == 'selection') {
    document.documentElement.style.setProperty('--selection-colour', colour);
  }
  $.each(nvrgtr_data.nodes, function(name, node) {
    if (key == 'bar_chart' && 'bar_chart' in node) {
      node.bar_chart.attr({fill: colour});
    } else if (key == 'label_bg') {
      node.label_rest_colour = colour;
      if (!node.selected) {
        node.label_highlight.attr({fill: colour});
        node.label_highlight.show();
        if ('variant_select_label' in node) {
          node.variant_select_label.css('background', colour);
        }
      }
    } else if (key == 'label_text') {
      node.text.attr({fill: colour});
      if ('variant_select_label' in node) {
        node.variant_select_label.css('color', colour);
      }
    } else if (key == 'cluster_highlight') {
      node.node_mouseover_colour = colour;
      if (node.label_mouseover_key == 'cluster_highlight') {
        node.label_mouseover_colour = colour;
      }
    } else if (key == 'selection') {
      if (node.node_selected_key == 'selection') {
        node.node_selected_colour = colour;
      }
      if (node.label_selected_key == 'selection') {
        node.label_selected_colour = colour;
      }
      if (node.selected) {
        nodeLabelMouseclickHandler(name, false, true);
      }
    } else if (key == 'search' && !(nvrgtr_page.page == 'results' && nvrgtr_data.variants.indexOf(name) != -1)) {
      node.search_highlight.attr({fill: colour, stroke: colour});
    }
  });
}
function updateClusterColours() {
  var key, keys = ['cluster_background', 'cluster_highlight'];
  for (var i=0; i<keys.length; ++i) {
    key = keys[i];
    updateClusterTransColour(key, nvrgtr_display_opts.colours[key]);
  }
}
function updateClusterTransColour(key, colour) {
  var ret = calculateTransparentComplement(colour, nvrgtr_display_opts.colours.cluster_opacity, nvrgtr_display_opts.colours.tree_background);
  var trans_comp = (ret.closest_colour == '') ? ret.trans_comp : ret.closest_colour,
    trans_key = key + '_trans';
  nvrgtr_display_opts.colours[trans_key] = trans_comp;
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
function updateDisplayOptionSpinners() {
  $("#displayTreeFontSizeSpinner").spinner('value', nvrgtr_display_opts.fonts.tree_font_size);
  $("#displayTreeWidthSpinner").spinner('value', nvrgtr_display_opts.sizes.tree);
  $("#displayTreeBigNodeSpinner").spinner('value', nvrgtr_display_opts.sizes.big_marker_radius);
  $("#displayTreeSmallNodeSpinner").spinner('value', nvrgtr_display_opts.sizes.small_marker_radius);
  $("#displayTreeBarChartSizeSpinner").spinner('value', nvrgtr_display_opts.sizes.bar_chart_height);
  $("#displayTreeLabelOutlineSpinner").spinner('value', nvrgtr_display_opts.sizes.labels_outline);
  $("#displayTreeInitAngleSpinner").spinner('value', nvrgtr_display_opts.angles.init_angle);
  $("#displayTreeBufferAngleSpinner").spinner('value', nvrgtr_display_opts.angles.buffer_angle);
  $("#displayBannerHeightSpinner").spinner('value', nvrgtr_display_opts.sizes.banner_height);
  $("#displayBannerBufferSpinner").spinner('value', nvrgtr_display_opts.sizes.banner_buffer);
  $("#displayBannerFontSpinner").spinner('value', nvrgtr_display_opts.fonts.banner_font_size);
}
// =====  Selection group updating:
function updateSelectionGroupColour(key) {
  if (nvrgtr_data.selected.size == 0) {
    return false;
  }
  var jscolor_id, recolour_fxn;
  if (key == 'node') {
    jscolor_id = "#node_colourPicker";
    recolour_fxn = changeSelectionGroupNodeColour;
  } else if (key == 'label') {
    jscolor_id = "#label_colourPicker";
    recolour_fxn = changeSelectionGroupLabelColour;
  } else if (key == 'text') {
    jscolor_id = "#text_colourPicker";
    recolour_fxn = changeSelectionGroupTextColour;
  } else {
    console.log('In updateSelectionGroupColour(), unknown key "'+key+'"');
    return false;
  }
  var colour = getJscolorValue($(jscolor_id));
  nvrgtr_data.selected.forEach(function(var_name) {
    recolour_fxn(nvrgtr_data.nodes[var_name], colour);
  });
}
function updateSelectionGroupNodeSize(new_radius) {
  if (nvrgtr_data.selected.size == 0) {
    return false;
  }
  if (isNaN(new_radius)) {
    new_radius = null;
  }
  nvrgtr_data.selected.forEach(function(var_name) {
    changeSelectionGroupNodeSize(nvrgtr_data.nodes[var_name], new_radius);
  });
}
function getCurrentBannerColours() {
  var banner_cols = [];
  $("#selectGroupBannerListDiv > .select-group-banner-div > .jscolor").each(function() {
    banner_cols.unshift(getJscolorValue($(this))); // Not appended as the HTML order is reversed for style.
  });
  return banner_cols;
}
function updateSelectionGroupBannerColour(jscolor) {
  var banner_cols = getCurrentBannerColours();
  nvrgtr_data.selected.forEach(function(var_name) {
    changeSelectionGroupBannerColours(nvrgtr_data.nodes[var_name], banner_cols);
  });
}
function applySelectionGroupFormat(clear_formatting=false) {
  // Applies the on-page formatting values to all currently selected variants
  var node_colour = getJscolorValue($("#node_colourPicker")),
    label_colour = getJscolorValue($("#label_colourPicker")),
    text_colour = getJscolorValue($("#text_colourPicker")),
    node_size = $("#selectGroupNodeSizeSpinner").val() || null
    banner_colours = getCurrentBannerColours();
  if (clear_formatting == true) {
    node_colour = false, label_colour = false, text_colour = false, node_size = false;
    for (let i=0; i<banner_colours.length; ++i) {
      banner_colours[i] = '#FFFFFF';
    }
  }
  nvrgtr_data.selected.forEach(function(var_name) {
    changeSelectionGroupNodeColour(nvrgtr_data.nodes[var_name], node_colour);
    changeSelectionGroupLabelColour(nvrgtr_data.nodes[var_name], label_colour);
    changeSelectionGroupTextColour(nvrgtr_data.nodes[var_name], text_colour);
    changeSelectionGroupNodeSize(nvrgtr_data.nodes[var_name], node_size);
    changeSelectionGroupBannerColours(nvrgtr_data.nodes[var_name], banner_colours);
  });
}
function applyAllSelectionGroupFormats() {
  // Iterates over the saved selection groups in order, applying each format in turn
  for (let format of nvrgtr_data.selection_groups.values()) {
    format.names.forEach(function(var_name) {
      changeSelectionGroupNodeColour(nvrgtr_data.nodes[var_name], format.node_colour);
      changeSelectionGroupLabelColour(nvrgtr_data.nodes[var_name], format.label_colour);
      changeSelectionGroupTextColour(nvrgtr_data.nodes[var_name], format.text_colour);
      changeSelectionGroupNodeSize(nvrgtr_data.nodes[var_name], format.node_size);
      changeSelectionGroupBannerColours(nvrgtr_data.nodes[var_name], format.banner_colours);
    });
  }
}
function addNewSelectionGroup(group_name, group_data=null, scroll_pane=true) {
  // Truncate the name for display if it's too long
  var group_display_name, group_name_max_display_length = 16;
  if (group_name.length > group_name_max_display_length) {
    group_display_name = group_name.slice(0, group_name_max_display_length) + '...';
  } else {
    group_display_name = group_name;
  }
  var group_size = group_data==null ? nvrgtr_data.selected.size : group_data.names.length;
  // Create the list_element and close button for that group:
  var list_element = $('<div class="select-group-list-element prevent-text-selection"><label class="select-group-drag" title="Drag to re-order selection groups">&#10606;</label><label class="select-group-list-name">'+group_display_name+'</label><label class="select-group-list-size">('+group_size+')</label></div>');
  var button_element = $('<button class="list-close-button prevent-text-selection" title="Delete this selection group">&#10799</button>');
  list_element.append(button_element);
  // Set up the mouse functionality of the elements:
  list_element.mouseover(function() {
    nvrgtr_data.selection_groups.get(group_name).names.forEach(function(var_name) {
      nodeLabelMouseoverHandler(var_name);
    });
  }).mouseout(function() {
    nvrgtr_data.selection_groups.get(group_name).names.forEach(function(var_name) {
      nodeLabelMouseoutHandler(var_name);
    });
  }).click(function() {
    nvrgtr_data.selection_groups.get(group_name).names.forEach(function(var_name) {
      nodeLabelMouseclickHandler(var_name);
    });
    var node_colour = nvrgtr_data.selection_groups.get(group_name).node_colour,
      label_colour = nvrgtr_data.selection_groups.get(group_name).label_colour,
      text_colour = nvrgtr_data.selection_groups.get(group_name).text_colour,
      node_size = nvrgtr_data.selection_groups.get(group_name).node_size;
    if (node_colour == null) {
      $("#node_colourPicker")[0].jscolor.fromString('#FFFFFF');
      $("#node_colourPicker").val('');
    } else {
      $("#node_colourPicker")[0].jscolor.fromString(node_colour);
    }
    if (label_colour == null) {
      $("#label_colourPicker")[0].jscolor.fromString('#FFFFFF');
      $("#label_colourPicker").val('');
    } else {
      $("#label_colourPicker")[0].jscolor.fromString(label_colour);
    }
    if (text_colour == null) {
      $("#text_colourPicker")[0].jscolor.fromString('#FFFFFF');
      $("#text_colourPicker").val('');
    } else {
      $("#text_colourPicker")[0].jscolor.fromString(text_colour);
    }
    $("#selectGroupNodeSizeSpinner").val(node_size); // Works with numbers or null.
    if (list_element.hasClass('select-group-list-element-active')) {
      list_element.removeClass('select-group-list-element-active');
      $("#selectGroupNameInput").val('');
    } else {
      $(".select-group-list-element").removeClass('select-group-list-element-active');
      list_element.addClass('select-group-list-element-active');
      $("#selectGroupNameInput").val(group_name);
    }
    var banner_col,
      banner_cols = nvrgtr_data.selection_groups.get(group_name).banner_colours, num_banners = banner_cols.length;
    $("#selectGroupBannerListDiv > .select-group-banner-div > .jscolor").each(function(banner_ind) {
      banner_col = banner_cols[num_banners - banner_ind - 1];
      if (banner_col == null) {
        this.jscolor.fromString('#FFFFFF');
        $(this).val('');
      } else {
        this.jscolor.fromString(banner_col);
      }
    });
  });
  button_element.hover(function() {
    return false; // Prevents propagation to the list_element
  }).click(function() {
    $(this).parent().remove();
    nvrgtr_data.selection_groups.delete(group_name);
    return false; // Prevents the click from propagating to the list_element
  });
  // Place the new elements on the page:
  if (nvrgtr_data.selection_groups.has(group_name)) {
    $(".select-group-list-name").each(function() {
      if ($(this).text() == group_display_name) {
        $(this).parent().replaceWith(list_element);
      }
    });
  } else {
    $("#selectGroupListDiv").append(list_element);
  }
  $(".select-group-list-element").removeClass('select-group-list-element-active'); // Ensure no other groups are selected
  list_element.addClass('select-group-list-element-active'); // Select the new group
  // Scroll the list if needed
  if (scroll_pane == true) {
    let scroll_height_to = $("#selectGroupListDiv")[0].scrollHeight;
    if (nvrgtr_data.selection_groups.has(group_name)) {
      let group_ind = [...nvrgtr_data.selection_groups.keys()].indexOf(group_name);
      scroll_height_to *= group_ind / nvrgtr_data.selection_groups.size;
    }
    $("#selectGroupListDiv").animate({scrollTop: scroll_height_to}, 250);
  }
  // Update the backend data:
  if (group_data == null) {
    group_data = {'names':[...nvrgtr_data.selected], 'node_colour':getJscolorValue($("#node_colourPicker")), 'label_colour':getJscolorValue($("#label_colourPicker")), 'text_colour':getJscolorValue($("#text_colourPicker")), 'banner_colours':getCurrentBannerColours(), 'node_size':$("#selectGroupNodeSizeSpinner").val() || null};
  }
  nvrgtr_data.selection_groups.set(group_name, group_data);
}
function addBannerFormatElements(banner_name) {
  var sg_pane = $("#selectionGroupsDiv"), banner_list = $("#selectGroupBannerListDiv"),
    banner_div = $('<div class="select-group-banner-div horizontal-row-div"><label class="select-group-banner-drag prevent-text-selection" title="Drag to re-order banners">&#10606;</label></div>'),
    banner_name_input = $('<input class="select-group-banner-name" value="'+banner_name+'">'),
    banner_color = $('<input class="jscolor" placeholder="None" spellcheck="false" onchange="updateSelectionGroupBannerColour(this)">');
  banner_name_input.blur(function() {
    let banner_eles = banner_list.children(),
      banner_ind = banner_eles.length - banner_eles.index(banner_div) - 1,
      new_name = $(this).val();
    nvrgtr_display_opts.labels.banner_names[banner_ind] = new_name;
    nvrgtr_data.banner_labels[banner_ind].attr('text', new_name);
  }).keydown(function(event) {
    if (event.which == 13) {
      banner_name_input.blur();
    }
  });
  banner_div.append(banner_name_input);
  //new jscolor(banner_color[0]);  // This line should suffice, but does not currently work.
  banner_color[0].jscolor = new jscolor(banner_color[0]); // Needed otherwise banner_color[0].jscolor remains undefined. I believe this is a bug in jscolor, so this line may not be needed in the future.
  banner_color[0].jscolor.required = false; // Jscolor isn't respecting any other way to set
  banner_color.val('');                     // this info. Probably related to the bug above.
  banner_color.keydown(function(event) {
    if (event.which == 13) {
      updateSelectionGroupBannerColour(this);
      this.jscolor.hide();
    }
  });
  banner_div.append(banner_color);
  var banner_close_button = $('<button class="list-close-button prevent-text-selection" title="Remove this banner">&#10799</button>');
  banner_close_button.click(function() {
    let banner_eles = banner_list.children(),
      banner_ind = banner_eles.length - banner_eles.index(banner_div) - 1; // Order is reversed
    nvrgtr_display_opts.labels.banner_names.splice(banner_ind, 1);
    for (const [group_name, group_data] of nvrgtr_data.selection_groups.entries()) {
      group_data.banner_colours.splice(banner_ind, 1); // Remove from the array
    }
    $("#redrawTreeButton").click();
    if (nvrgtr_display_opts.labels.banner_names.length == 0) {
      $("#bannerLegendDiv").hide();
    }
    banner_div.remove();
    sg_pane.css('maxHeight', sg_pane[0].scrollHeight+"px");
  });
  banner_div.append(banner_close_button);
  banner_list.prepend(banner_div);
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
  // Prefix used for private routes. It must match the daemonURL function in navargator_daemon.py, and be handled by the web server software (Apache, NGINX, etc).
  return nvrgtr_page.server_url + '/daemon' + url;
}
function getPageBasicData() {
  return {'session_id':nvrgtr_page.session_id, 'browser_id':nvrgtr_page.browser_id};
}
function getPageVisualData() {
  return {...getPageBasicData(), 'display_opts':nvrgtr_display_opts, 'selection_groups_order':[...nvrgtr_data.selection_groups.keys()],  'selection_groups_data':Object.fromEntries(nvrgtr_data.selection_groups)};
}
function getPageAssignedData() {
  return {...getPageVisualData(), 'chosen':nvrgtr_data.chosen, 'available':nvrgtr_data.available, 'ignored':nvrgtr_data.ignored};
}
function maintainServer() {
  // This is continually called to maintain the background server.
  if (!nvrgtr_page.instance_closed) {
    $.ajax({
      url: daemonURL('/maintain-server'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify(getPageBasicData()),
      error: function(error) {
        console.log('connection to NaVARgator server lost. The error:', error);
        nvrgtr_page.instance_closed = true;
        clearInterval(nvrgtr_page.maintain_interval_obj);
      }
    });
  }
}
function changeSessionID(new_s_id) {
  let old_s_id = nvrgtr_page.session_id;
  nvrgtr_page.session_id = new_s_id;
  closeInstance(old_s_id);
}
function closeInstance(s_id=null) {
  // Chrome disallowed sync AJAX calls from unload/beforeunload, so this is the preferred way. See https://groups.google.com/a/chromium.org/forum/#!topic/chromium-discuss/cZjD9X7825E
  if (s_id == null) {
    s_id = nvrgtr_page.session_id;
  }
  var form = new FormData();
  form.append('session_id', s_id);
  form.append('browser_id', nvrgtr_page.browser_id);
  navigator.sendBeacon(daemonURL('/instance-closed'), form);
  // Set and clear page attributes, almost certainly unecessary but w/e.
  nvrgtr_page.instance_closed = true;
  clearInterval(nvrgtr_page.maintain_interval_obj);
}
function getReport() {
  $.ajax({
    url: daemonURL('/get-connections-report'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify(getPageBasicData()),
    success: function(data_obj) {
      let active = $.parseJSON(data_obj);
      console.log('ACTIVE CONNECTIONS REPORT\n=================');
      console.log('Currently '+active.length+' active sessions');
      active.forEach(function(session, index) {
        console.log('Session '+index+':');
        console.log('  Tree size: '+session.num_leaves+'; Clustering runs: '+session.num_params);
        if (session.ages.length == 0) {
          console.log('  Open browsers: 0');
        } else {
          let ages = session.ages.map(function(age) {
            if (age >= 86400) {
              return parseInt(age / 86400) + 'd';
            } else if (age >= 3600) {
              return parseInt(age / 3600) + 'h';
            } else {
              return parseInt(age) + 's';
            }
          });
          console.log('  Open connections: '+session.ages.length+'; Ages: '+ages.join(', '));
        }
      });
    },
    error: function(error) {
      console.log('Could not retrieve the report.');
      console.log('The error code: '+error.status+'; The text: '+error.responseText);
    }
  });
}

// =====  Functions to calculate and warn about colour choices:
function getJscolorValue($jscolor) {
  // Written to allow for jscolor with required=false. For those, '#'+jscolor returns the previous colour if the input has been deleted, and I want to use the deleted state.
  var jscolor = $jscolor[0].jscolor, colour = ('#'+jscolor).toUpperCase(),
    input_val = $jscolor.val().toUpperCase();
  if (colour != '#'+input_val && colour != input_val) { // Input has been deleted or is bad
    jscolor.fromString('FFFFFF');
    $jscolor.val('');
    colour = null;
  }
  return colour;
}

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
function treeIsLoading() {
  // To be called when a tree may be modified, but still waiting to hear if successful. Adds "loading" effects.
  $("#treeLoadingMessageGroup").show();
  $("#treeGroup").attr("opacity", "0.4");
}
function treeHasLoaded() {
  // To remove any "loading" effects, whether the tree was modified successfully or not.
  $("#treeLoadingMessageGroup").hide();
  $("#treeGroup").attr("opacity", "1.0");
}
function redrawTree() {
  // Overwritten in input.js and results.js to redraw the tree and reset visible elements.
}
function roundFloat(num, num_dec) {
  // Rounds numbers to num_dec decimal points, without including trailing 0s.
  let x = Math.pow(10, num_dec);
  return Math.round((num + Number.EPSILON) * x) / x;
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
function cleanSvg(selector) {
  // new_svg[0].outerHTML won't work in IE, but neither does the rest of navargator
  // Removes hidden elements. Returns the svg data ready to be passed to downloadData()
  let new_svg = $(selector).clone();
  new_svg.find("*").each(function() {
    if ($(this).css('display') == 'none' || $(this).css('font-size') == '0px' || $(this).attr('opacity') == 0) {
      $(this).remove();
    }
  });
  return new_svg[0].outerHTML;
}
function saveDataString(data_str, file_name, file_type) {
  // Uses javascript to save the string as a file to the client's download directory. This method works for >1MB svg files, for which other methods failed on Chrome.
  var data_blob = new Blob([data_str], {type:file_type});
  var data_url = URL.createObjectURL(data_blob);
  var download_link = document.createElement("a");
  download_link.href = data_url;
  download_link.download = file_name;
  document.body.appendChild(download_link); // Some browsers require these two lines,
  download_link.click();
  document.body.removeChild(download_link); // while others do not. Keep em.
}
function downloadData(filename, data, blob_type) {
  var blob = new Blob([data], {type:blob_type}),
    blob_url = URL.createObjectURL(blob),
    download_link = document.createElement("a");
  download_link.href = blob_url;
  download_link.download = filename;
  document.body.appendChild(download_link);
  download_link.click();
  document.body.removeChild(download_link);
  download_link = null; // Removes the element
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
function setupCoreHelpButtonText() {
  // Display options help:
  $("#displayOptsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
  // Selection groups help:
  $("#selectionGroupsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
  // Tree help:
  $("#treeHelp .help-text-div").append("<p>Click on a node or label and then shift-click another to (de)select all variants between them.</p>");
  $("#pairwiseDistancesHelp .help-text-div").append("<p>Enter two variant names per line, separated by a tab character.</p>");
}
