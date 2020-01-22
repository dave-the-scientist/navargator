// NOTE:

// TODO:
// - Finish setupSelectionGroupsPane()
//   - Save button should add an entry into the div, where that entry shows the name, size, and a button to delete the group. Clicking and mouseover on those entries should highlight/click the whole group. When clicked, should fill out the colour/size info associated with it. In the back end, should add an entry to an object inside nvrgtr_data (name: {'node_colour':XX, 'label_colour':YY, 'banners':[], ...}).
//     - Would be great if I could change the font colour of the node names, and include that as an option as well.
//   - Need a button to add a 'banner' around the tree. When I do, it's colour option should show up below 'node size', 1 row per banner. Should have it's own button to delete a banner. When a banner is added, should append an entry to every selection group's 'banners' array. If the second banner is deleted, should remove the 2nd entry in each selection group's 'banners' array.
//   - Might be useful to have a 'clear all' button, probably in the top-right corner. It would not only delete all selection groups and banners, but un-set all colours/sizes.
//   - The tree drawing functions are going to have to check if there are banners and account for their size.
//   - The selection groups (with colour/size data) should be saved in session files, and should transfer from input to results.
// - Stress test fitSigmoidCurve(), especially if the y-values are logarithmic, or if there are data from 2 curves.
// - The display options are in 4-column tables. Change to 2 columns, use display-options-label or display-options-table td CSS to style things.
//   - Why?
// - drawTree in core_tree_functions.js should use the nvrgtr_page.page value to decide whether or not to draw marker_tooltips; shouldn't need to pass in an argument.
// - Finish updateClusterTransColour(key, colour); need to inform the user when a colour can't be made.
// - Many of the opts.colours should be pulled from core.css.
// - Ensure error codes in processError() match with error codes in navargator_daemon.py.

// =====  Common options and parameters
var nvrgtr_page = {
  'server_url':null, 'session_id':'', 'browser_id':'', 'instance_closed':false, 'maintain_interval':2000, 'maintain_interval_obj':null, 'max_upload_size':20000000
};
var last_slash = window.location.href.lastIndexOf('/');
if (last_slash > 0) {
  nvrgtr_page.server_url = window.location.href.substring(0, last_slash);
} else {
  showErrorPopup('Error: could not determine the base of the current URL.');
}
var nvrgtr_data = { // Variables used by each page.
  'leaves':[], 'chosen':[], 'available':[], 'ignored':[], 'search_results':[], 'selected':new Set(), 'selection_groups':{}, 'num_selected':0, 'allow_select':true, 'considered_variants':{}, 'lc_leaves':{}, 'tree_data':null, 'nodes':{}, 'tree_background':null, 'file_name':'unknown file', 'max_root_distance':0.0, 'max_root_pixels':0.0, 'r_paper':null, 'pan_zoom':null, 'threshold':null,
  'thresh':{
    'g':null, 'x_fxn':null, 'y_fxn':null, 'line_fxn':null, 'sigmoid_fxn':null, 'sigmoid_inv':null, 'sigmoid_data':null, 'line_graph':null, 'indicator':null, 'indicator_line_v':null, 'indicator_line_h':null, 'x_axis':null, 'y_axis':null, 'params':null, 'data':null
  }
};
var nvrgtr_settings = { // Page-specific settings, not user-modifiable.
  'graph' : {
    'histo_bins':15, 'total_width':null, 'total_height':null
  },
  'thresh':{
    'width':null, 'height':null, 'label_font':'Helvetica, Arial, sans-serif', 'label_font_size':'14px', 'scatter_stroke_width':'1px', 'scatter_stroke':'#555555', 'scatter_fill':'#EAFEEC', 'scatter_radius':2.5, 'line_stroke_width':'2px', 'line_stroke':null,
    'margin':{
      'top':10, 'right':15, 'bottom':44, 'left':40
    }
  }
};
var nvrgtr_default_display_opts = { // User-modifiable settings that persist between pages and sessions. Anything with a value of null cannot be set by the user.
  'fonts' : {
    'tree_font_size':13, 'family':'Helvetica, Arial, sans-serif'
  },
  'sizes' : {
    'tree':700, 'max_variant_name_length':15, 'scale_bar_distance':0.0, 'small_marker_radius':2, 'big_marker_radius':3, 'bar_chart_height':30, 'labels_outline':0.5, 'cluster_expand':4, 'cluster_smooth':0.75, 'inner_label_buffer':4, 'bar_chart_buffer':3, 'search_buffer':7
  },
  'angles' : {
    'init_angle':180, 'buffer_angle':20
  },
  'colours' : {
    'default_node':'#E8E8E8', 'chosen':'#24F030', 'available':'#24B1F0', 'ignored':'#5D5D5D', 'search':'#C6FF6F', 'cluster_outline':'#000000', 'cluster_background':'#EAFEEC', 'cluster_highlight':'#92F7E4', 'singleton_cluster_background':'#9624F0', 'selection':'#FAB728', 'bar_chart':'#1B676B', 'tree_background':'#FFFFFF', 'cluster_opacity':0.43, 'cluster_background_trans':null, 'cluster_highlight_trans':null
  }
};
var nvrgtr_display_opts = $.extend(true, {}, nvrgtr_default_display_opts); // Deep copy

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
  }else {
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
      pane.css('maxWidth', "0px");
      pane.css('maxHeight', "0px");
      return false;
    });
  });
}
function showFloatingPane(pane) {
  var pane_width = pane[0].scrollWidth, pane_height = pane[0].scrollHeight;
  pane.css('maxWidth', pane_width+"px");
  pane.css('maxHeight', pane_height+"px");
  var pane_left = pane.offset().left, pane_right = pane_left + pane_width, doc_width = $(document).width();
  if (pane_left < 0) { // Unsure if this aspect is working.
    pane.offset({'left': 0});
  } else if (pane_right > doc_width) {
    pane.offset({'left': doc_width - pane_width});
  }
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
  $("#showLegendCheckbox").change(function() {
    if ($("#showLegendCheckbox").is(':checked')) {
      $("#treeLegendLeftGroup").show();
    } else {
      $("#treeLegendLeftGroup").hide();
    }
  });
  $("#showScaleBarCheckbox").change(function() {
    if ($("#showScaleBarCheckbox").is(':checked')) {
      $("#treeScaleBarGroup").show();
    } else {
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
    processDisplayOptions(nvrgtr_default_display_opts);
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
  $("#node_colourPicker").keydown(function(event) {
    if (event.which == 13) {
      updateSelectionGroupColour('node', this.jscolor);
      this.jscolor.hide();
    }
  });
  $("#label_colourPicker").keydown(function(event) {
    if (event.which == 13) {
      updateSelectionGroupColour('label', this.jscolor);
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
  $("#selectGroupNameInput").keydown(function(event) {
    if (event.which == 13) {
      $("#selectGroupSaveButton").click();
    }
  });
  var select_group_int = 1; // For unnamed groups
  $("#selectGroupSaveButton").click(function() {
    if (nvrgtr_data.selected.size == 0) {
      return false;
    }
    var group_name = $.trim($("#selectGroupNameInput").val());
    if (group_name == '') {
      group_name = 'Group_' + select_group_int;
      select_group_int += 1;
    }
    $("#selectGroupNameInput").val('');
    // Create the list_element and close button for that group:
    var list_element = $('<div class="select-group-list-element"><label class="select-group-list-name">'+group_name+'</label><label class="select-group-list-size">('+nvrgtr_data.selected.size+')</label></div>');
    var button_element = $('<button class="select-group-list-close prevent-text-selection">X</button>');
    list_element.append(button_element);
    // Set up the mouse functionality of the elements:
    list_element.mouseover(function() {
      nvrgtr_data.selection_groups[group_name].names.forEach(function(var_name) {
        nodeLabelMouseoverHandler(var_name);
      });
    }).mouseout(function() {
      nvrgtr_data.selection_groups[group_name].names.forEach(function(var_name) {
        nodeLabelMouseoutHandler(var_name);
      });
    }).click(function() {
      nvrgtr_data.selection_groups[group_name].names.forEach(function(var_name) {
        nodeLabelMouseclickHandler(var_name);
      });
      var node_colour = nvrgtr_data.selection_groups[group_name].node_colour,
        label_colour = nvrgtr_data.selection_groups[group_name].label_colour,
        node_size = nvrgtr_data.selection_groups[group_name].node_size;
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
      $("#selectGroupNodeSizeSpinner").val(node_size); // Works with numbers or null.
      if (list_element.hasClass('select-group-list-element-active')) {
        list_element.removeClass('select-group-list-element-active');
        $("#selectGroupNameInput").val('');
      } else {
        $(".select-group-list-element").removeClass('select-group-list-element-active');
        list_element.addClass('select-group-list-element-active');
        $("#selectGroupNameInput").val(group_name);
      }

    });
    button_element.hover(function() {
      return false; // Prevents propagation to the list_element
    }).click(function() {
      $(this).parent().remove();
      return false; // Prevents the click from propagating to the list_element
    });
    // Place the new elements on the page:
    if (group_name in nvrgtr_data.selection_groups) {
      $(".select-group-list-name").each(function() {
        if ($(this).text() == group_name) {
          console.log(this, $(this).parent());
          $(this).parent().replaceWith(list_element);
        }
      });
    } else {
      $("#selectGroupListDiv").append(list_element);
    }
    // Update the backend data:
    var sg_data = {'names':[...nvrgtr_data.selected], 'node_colour':getJscolorValue("#node_colourPicker"), 'label_colour':getJscolorValue("#label_colourPicker"), 'node_size':$("#selectGroupNodeSizeSpinner").val() || null};
    nvrgtr_data.selection_groups[group_name] = sg_data;
  });
}
function setupThresholdPane() {
  // When implemented, make sure the truncation doesn't affect validation (because names will be validated by client and server).
  var compute_pane = $("#thresholdComputePane"), threshold_text = $("#thresholdDataText"), error_label = $("#thresholdErrorLabel"), max_val_input = $("#thresholdMaxValInput");
  threshold_text.data('data', []); // The data to be graphed
  function validateThresholdData() {
    var cur_ind = 0, data = [], line, line_data, name1, name2, value;
    var lines = threshold_text.val().trim().split('\n');
    if (lines.length < 2) {
      error_label.html('<b>Invalid data</b>');
      return false;
    }
    for (var i=0; i<lines.length; ++i) {
      line = lines[i];
      line_data = line.split('\t');
      if (line_data.length != 3 || line_data[0].length == 0 || line_data[1].length == 0 || line_data[2].length == 0) {
        focusScrollSelectInTextarea(threshold_text, cur_ind, cur_ind + line.length);
        error_label.html('<b>Invalid line</b>');
        return false;
      }
      name1 = line_data[0], name2 = line_data[1], value = line_data[2];
      if (!nvrgtr_data.leaves.includes(name1)) {
        focusScrollSelectInTextarea(threshold_text, cur_ind, cur_ind + name1.length);
        error_label.html('<b>Invalid variant</b>');
        return false;
      } else {
        cur_ind += name1.length + 1; // +1 for the removed \t
      }
      if (!nvrgtr_data.leaves.includes(name2)) {
        focusScrollSelectInTextarea(threshold_text, cur_ind, cur_ind + name2.length);
        error_label.html('<b>Invalid variant</b>');
        return false;
      } else {
        cur_ind += name2.length + 1; // +1 for the removed \t
      }
      if (isNaN(value) || parseFloat(value) < 0) {
        focusScrollSelectInTextarea(threshold_text, cur_ind, cur_ind + value.length);
        error_label.html('<b>Invalid number</b>');
        return false;
      } else {
        cur_ind += value.length + 1; // +1 for the removed \n
      }
      data.push({'name1':name1, 'name2':name2, 'value':parseFloat(value)});
    }
    return data;
  }
  // End of function validateThresholdData()
  $("#thresholdComputeButton").click(function() {
    showFloatingPane(compute_pane);
  });
  $("#thresholdDataText").keydown(function(e) {
    if (e.which == 9) { // Causes tab to insert \t instead of switching focus
      var sel_start = this.selectionStart, sel_end = this.selectionEnd,
        cur_val = $(this).val();
      $(this).val(cur_val.slice(0, sel_start) + "\t" + cur_val.slice(sel_end));
      this.selectionStart = this.selectionEnd = sel_start + 1;
      return false;
    }
  });
  $("#thresholdLoadDataButton").click(function() {
    threshold_text.val("Hps.Strain5.Unk\tHps.540.SV4\t1.0\nHps.Strain5.Unk\tHps.nx63.Unk\t0.85\nHps.Strain5.Unk\tApp.h87.Unk\t0.21\nHps.Strain5.Unk\tApp.h167.Unk\t0.03\nA.suis.h57.Unk\tA.suis.h58.Unk\t0.99\nA.suis.h57.Unk\tApp.h49.SV7\t0.05\nA.suis.h57.Unk\tHps.h384.Unk\t0.46");
  });
  $("#thresholdValidateButton").click(function() {
    var data = validateThresholdData();
    if (data != false) {
      error_label.html('Data are valid');
    }
  });
  $("#thresholdFitCurveButton").click(function() {
    var data = validateThresholdData();
    if (data == false) {
      return false;
    }
    var max_val = max_val_input.val();
    if (!max_val_input.hasClass("threshold-max-modified")) {
      max_val = null;
    }
    $.ajax({
      url: daemonURL('/fit-curve'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({'session_id':nvrgtr_page.session_id, 'browser_id':nvrgtr_page.browser_id, 'chosen':nvrgtr_data.chosen, 'available':nvrgtr_data.available, 'ignored':nvrgtr_data.ignored, 'display_opts':nvrgtr_display_opts, 'data':data, 'max_val':max_val}),
      success: function(data_obj) {
        var thresh_data = $.parseJSON(data_obj);
        nvrgtr_data.thresh.params = {'b':thresh_data.b, 'm':thresh_data.m, 'r':thresh_data.r};
        max_val_input.val(roundFloat(thresh_data.r, 6));
        $("#thresholdMidlineValue").text(roundFloat(thresh_data.m, 6));
        $("#thresholdSteepnessValue").text(roundFloat(thresh_data.b, 6));
        nvrgtr_data.thresh.data = thresh_data.data;
        error_label.html('');
        if (nvrgtr_data.thresh.sigmoid_inv == null) {
          // Expand the panel to show the graph
          $("#thresholdPaneGraphColumn").show();
          $("#thresholdPaneParamsDiv").show();
          showFloatingPane(compute_pane);
        }
        updateThresholdGraph();
        updateThresholdSlider($("#thresholdSlider").slider('value'));
      },
      error: function(error) { processError(error, "Error fitting the data to a curve"); }
    });
  });
  max_val_input.change(function() {
    var new_raw_val = max_val_input.val(), new_val = parseFloat(new_raw_val), old_val = roundFloat(nvrgtr_data.thresh.params.r, 6);
    if (new_raw_val === '') {
      max_val_input.removeClass("threshold-max-modified");
      return false;
    } else if (isFinite(new_val) && new_val != old_val && new_val > 0) {
      max_val_input.val(new_val);
      max_val_input.addClass("threshold-max-modified");
    } else {
      max_val_input.val(old_val);
    }
  });
  max_val_input.on("keydown", function(event) {
    if (event.which == 13) { // 'Enter' key
      max_val_input.blur();
      $("#thresholdFitCurveButton").click();
    }
  });
  var val_input = $("#thresholdCritValInput");
  val_input.val(0.7);
  val_input.blur(function(event) {
    var new_raw_val = val_input.val(), new_val = parseFloat(new_raw_val);
    if (isFinite(new_val) && new_val >= 0) {
      if (new_val > $("#thresholdSlider").slider('option', 'max')) {
        new_val = $("#thresholdSlider").slider('option', 'max');
      }
      updateThresholdSlider(new_val);
      $("#thresholdSlider").slider("value", new_val);
    } else {
      val_input.val($("#thresholdSlider").slider("value"));
    }
  });
  val_input.on("keydown", function(event) {
    if (event.which == 13) { // 'Enter' key
      val_input.blur();
    }
  });
  $("#thresholdOkButton").click(function() {
    if (isFinite(nvrgtr_data.threshold)) {
      $("#thresholdInput").val(nvrgtr_data.threshold);
      $("#thresholdComputePane .floating-pane-close").click();
    }
  });

  setupThresholdGraph();
  setupThresholdSlider();
}
function setupThresholdSlider() {
  var slider = $("#thresholdSlider").slider({
    orientation:"vertical",
    min: 0, max: 1.0,
    value: 0.7, step: 0.001,
    create: function() {
    },
    slide: function(event, ui) {
      updateThresholdSlider(ui.value);
    },
    change: function(event, ui) { // Fires after programaticly changing the value
      updateThresholdSlider(ui.value);
    },
    stop: function(event, ui) {
      nvrgtr_data.thresh.indicator.attr("display", "none");
    }
  });
  slider.css("height", nvrgtr_settings.thresh.height+"px");
  slider.css("margin-top", nvrgtr_settings.thresh.margin.top+"px");
  slider.on("mousedown", function() {
    if (nvrgtr_data.thresh.sigmoid_inv != null) { // Prevents it from showing until a curve has been fit.
      nvrgtr_data.thresh.indicator.attr("display", "");
    }
  });
}
function setupThresholdGraph() {
  var graph_width_str = $("#thresholdSvg").css('width'), graph_height_str = $("#thresholdSvg").css('height'),
    total_width = parseInt(graph_width_str.slice(0,-2)),
    total_height = parseInt(graph_height_str.slice(0,-2)),
    margin = nvrgtr_settings.thresh.margin;
  nvrgtr_settings.thresh.line_stroke = getComputedStyle(document.documentElement)
    .getPropertyValue('--dark-background-colour');
  nvrgtr_settings.thresh.width = total_width - margin.right - margin.left;
  nvrgtr_settings.thresh.height = total_height - margin.top - margin.bottom;
  // Set up svg objects:
  var svg = d3.select("#thresholdSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  nvrgtr_data.thresh.g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up scales and data objects:
  nvrgtr_data.thresh.x_fxn = d3.scaleLinear()
    .rangeRound([0, nvrgtr_settings.thresh.width])
    .clamp(true);
  nvrgtr_data.thresh.y_fxn = d3.scaleLinear()
    .range([nvrgtr_settings.thresh.height, 0])
    .clamp(true);
  nvrgtr_data.thresh.line_fxn = d3.line()
    .x(function(d) { return nvrgtr_data.thresh.x_fxn(d) })
    .y(function(d) { return nvrgtr_data.thresh.y_fxn(nvrgtr_data.thresh.sigmoid_fxn(d)) })
    .curve(d3.curveMonotoneX);
  // Graph axes:
  nvrgtr_data.thresh.x_axis = d3.axisBottom(nvrgtr_data.thresh.x_fxn);
  nvrgtr_data.thresh.y_axis = d3.axisLeft(nvrgtr_data.thresh.y_fxn);
  nvrgtr_data.thresh.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + nvrgtr_settings.thresh.height + ")");
  nvrgtr_data.thresh.g.append("g")
    .attr("class", "y-axis");
  var x_axis_vert_offset = 40, y_axis_vert_offset = 0, y_axis_horiz_offset = -30;
  nvrgtr_data.thresh.g.append("text") // x axis label
    .attr("font-family", nvrgtr_settings.thresh.label_font)
    .attr("font-size", nvrgtr_settings.thresh.label_font_size)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "text-after-edge")
    .attr("x", nvrgtr_settings.thresh.width/2)
    .attr("y", nvrgtr_settings.thresh.height + x_axis_vert_offset)
    .text("Phylogenetic distance");
  nvrgtr_data.thresh.g.append("text") // y axis label
    .attr("font-family", nvrgtr_settings.thresh.label_font)
    .attr("font-size", nvrgtr_settings.thresh.label_font_size)
    .attr("text-anchor", "middle")
    .attr("x", 0 - nvrgtr_settings.thresh.height/2 - y_axis_vert_offset)
    .attr("y", 0 + y_axis_horiz_offset)
    .attr("transform", "rotate(-90)")
    .text("Interaction value");
  // Line graph:
  nvrgtr_data.thresh.line_graph = nvrgtr_data.thresh.g.append("path")
    .attr("stroke-width", nvrgtr_settings.thresh.line_stroke_width)
    .attr("stroke", nvrgtr_settings.thresh.line_stroke)
    .attr("fill", "none");
  // Indicator shape and lines:
  nvrgtr_data.thresh.indicator = nvrgtr_data.thresh.g.append("g")
    .attr("display", "none");
  nvrgtr_data.thresh.indicator.append("circle")
    .attr("stroke", "#555555")
    .attr("stroke-width", "1px")
    .attr("fill", "none")
    .attr("r", "7")
    .attr("cx", "0")
    .attr("cy", "0");
  nvrgtr_data.thresh.indicator_line_v = nvrgtr_data.thresh.indicator.append("line")
    .attr("stroke", "#555555")
    .attr("stroke-width", "0.5px")
    .attr("x1", "0")
    .attr("y1", "6") // Is circle.attr("r") - 1
    .attr("x2", "0");
  nvrgtr_data.thresh.indicator_line_h = nvrgtr_data.thresh.indicator.append("line")
    .attr("stroke", "#555555")
    .attr("stroke-width", "0.5px")
    .attr("x1", "-6")  // Is circle.attr("r") - 1
    .attr("y1", "0")
    .attr("y2", "0");
  updateThreshAxes();
}
function updateThresholdGraph() {
  // Called when the graph is first drawn, and when the graph parameters are changed.
  updateThreshData();
  updateThreshGraph();
  updateThreshAxes();
}
function updateThreshData() {
  // Updates the domains of the x_ and y_fxn, updates sigmoid_fxn and line_fxn, generates sigmoid_data for the line, and binds them to the line
  // Update the sigmoid function:
  var params = nvrgtr_data.thresh.params;
  nvrgtr_data.thresh.sigmoid_fxn = generateSigmoidFunction(params.b, params.m, params.r);
  nvrgtr_data.thresh.sigmoid_inv = generateSigmoidInverse(params.b, params.m, params.r);
  var graph_y_intcpt = nvrgtr_data.thresh.sigmoid_fxn(0);

  // Update the axis domains:
  var max_dist = 0, max_value = 0;
  for (let i=0; i<nvrgtr_data.thresh.data.length; ++i) {
    if (nvrgtr_data.thresh.data[i].distance > max_dist) {
      max_dist = nvrgtr_data.thresh.data[i].distance;
    }
    if (nvrgtr_data.thresh.data[i].value > max_value) {
      max_value = nvrgtr_data.thresh.data[i].value;
    }
  }
  var max_x_val = max_dist * 1.3, max_y_val = Math.max(max_value, graph_y_intcpt);
  nvrgtr_data.thresh.x_fxn.domain([0, max_x_val]).nice();
  nvrgtr_data.thresh.y_fxn.domain([0, max_y_val]).nice();
  max_x_val = nvrgtr_data.thresh.x_fxn.ticks()[nvrgtr_data.thresh.x_fxn.ticks().length-1];

  // Update the data used to draw the sigmoid line:
  var num_sigmoid_points = 20;
  nvrgtr_data.thresh.sigmoid_data = [];
  for (var i=0; i<(num_sigmoid_points-1); ++i) {
    nvrgtr_data.thresh.sigmoid_data.push(i * max_x_val / (num_sigmoid_points-1));
  }
  nvrgtr_data.thresh.sigmoid_data.push(max_x_val);

  // Update the slider range:
  if ($("#thresholdSlider").slider("value") > graph_y_intcpt) {
    $("#thresholdSlider").slider("value", graph_y_intcpt);
  }
  $("#thresholdSlider").slider({max:graph_y_intcpt});
  var slider_offset = nvrgtr_data.thresh.y_fxn(graph_y_intcpt);
  $("#thresholdSlider").animate({
    'marginTop':(nvrgtr_settings.thresh.margin.top+slider_offset)+'px',
    'height':(nvrgtr_settings.thresh.height-slider_offset)+'px'
  }, 250);
}
function updateThreshGraph() {
  // The sigmoid line:
  nvrgtr_data.thresh.line_graph.datum(nvrgtr_data.thresh.sigmoid_data)
    .transition()
    .attr("d", nvrgtr_data.thresh.line_fxn);
  // The scatter plot:
  var scatter_circles = nvrgtr_data.thresh.g.selectAll(".thresh-circle")
    .data(nvrgtr_data.thresh.data);
  scatter_circles.enter().append("circle")
    .attr("class", "thresh-circle")
    .attr("stroke-width", nvrgtr_settings.thresh.scatter_stroke_width)
    .attr("stroke", nvrgtr_settings.thresh.scatter_stroke)
    .attr("fill", nvrgtr_settings.thresh.scatter_fill)
    .attr("r", nvrgtr_settings.thresh.scatter_radius)
    .attr("cx", function(d) { return nvrgtr_data.thresh.x_fxn(d.distance); })
    .attr("cy", nvrgtr_settings.thresh.height)
    .transition()
    .attr("cx", function(d) { return nvrgtr_data.thresh.x_fxn(d.distance); })
    .attr("cy", function(d) { return nvrgtr_data.thresh.y_fxn(d.value); });
  scatter_circles.transition()
    .attr("cx", function(d) { return nvrgtr_data.thresh.x_fxn(d.distance); })
    .attr("cy", function(d) { return nvrgtr_data.thresh.y_fxn(d.value); });
  scatter_circles.exit().transition()
    .attr("cy", nvrgtr_settings.thresh.height)
    .remove();
}
function updateThreshAxes() {
  nvrgtr_data.thresh.x_axis.tickFormat(d3.format(".3")); // trims trailing zeros
  nvrgtr_data.thresh.y_axis.tickFormat(d3.format(".3")); // trims trailing zeros
  nvrgtr_data.thresh.g.select(".x-axis")
    .transition()
    .call(nvrgtr_data.thresh.x_axis)
    .selectAll("text")
      .style("text-anchor", "start")
      .attr("x", 7)
      .attr("y", 5)
      .attr("dy", ".35em")
      .attr("transform", "rotate(55)");
  nvrgtr_data.thresh.g.select(".y-axis")
    .transition()
    .call(nvrgtr_data.thresh.y_axis);
}
function updateThresholdSlider(value) {
  $("#thresholdCritValInput").val(value);
  if (nvrgtr_data.thresh.sigmoid_inv != null) {
    nvrgtr_data.threshold = Math.max(nvrgtr_data.thresh.sigmoid_inv(value), 0);
    $("#thresholdCritDistSpan").text(roundFloat(nvrgtr_data.threshold, 3));
    updateThresholdIndicator(value, nvrgtr_data.threshold);
  }
}
function updateThresholdIndicator(val, dist) {
  var x_pos = nvrgtr_data.thresh.x_fxn(dist), y_pos = nvrgtr_data.thresh.y_fxn(val),
    v_line_length = nvrgtr_settings.thresh.height - y_pos;
  nvrgtr_data.thresh.indicator.attr("transform", "translate("+x_pos+", "+y_pos+")");
  nvrgtr_data.thresh.indicator_line_v.attr("y2", v_line_length);
  nvrgtr_data.thresh.indicator_line_h.attr("x2", -x_pos);
}
function generateSigmoidFunction(b, m, r) {
  // Generates the sigmoid function with the given parameters
  return function(x) {
    return (r/2)*(b*(m-x) / Math.sqrt((b*(m-x))**2 + 1) + 1);
  }
}
function generateSigmoidInverse(b, m, r) {
  // Generates the inverse of the sigmoid function with the given parameters
  return function(y) {
    var c = 2*y/r - 1;
    return m - c / (b*Math.sqrt(1-c*c));
  }
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
}
function processDisplayOptions(display_opts) {
  updateDisplayOptions(display_opts);
  setColourPickers();
  updateClusterColours();
  updateDisplayOptionSpinners();
}
function validateDisplayOption(category, key, new_val) {
  var val_type = $.type(nvrgtr_default_display_opts[category][key]), value, is_valid;
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
    is_valid = true;
    if (new_val.toLowerCase() == 'true') {
      value = true;
    } else if (new_val.toLowerCase() == 'false') {
      value = false;
    } else {
      is_valid = false;
    }
  } else if (val_type == 'null') {
    value = null;
    is_valid = true;
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
  var key_list = ['available', 'chosen', 'ignored', 'default_node', 'cluster_background', 'singleton_cluster_background', 'cluster_highlight', 'bar_chart', 'selection', 'search'];
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
    } else if (['bar_chart', 'cluster_highlight', 'selection', 'search'].indexOf(key) > -1) {
      updateLabelColours(key, colour);
    }
    if (['cluster_background', 'cluster_highlight'].indexOf(key) > -1) {
      // ^ This list must match that in updateClusterColours().
      updateClusterTransColour(key, colour);
    }
  } else {
    showErrorPopup("Error setting colour; key '"+key+"' not recognized. Please report this issue on the NaVARgator github page.", "NaVARgator colour picker");
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
      if (!node.selected) {
        node.label_highlight.attr({fill: nvrgtr_display_opts.colours.chosen});
      }
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
    } else if (key == 'cluster_highlight') {
      node.node_mouseover_colour = colour;
      if (node.label_mouseover_key == 'cluster_highlight') {
        node.label_mouseover_colour = colour;
        if (!node.selected) {
          node.label_highlight.attr({fill: colour});
        }
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
    } else if (key == 'search') {
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
}
// =====  Selection group updating:
function updateSelectionGroupColour(key, jscolor) {
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
  } else {
    console.log('In updateSelectionGroupColour(), unknown key "'+key+'"');
    return false;
  }
  var colour = getJscolorValue(jscolor_id);
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
      contentType: "application/json",
      data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'browser_id': nvrgtr_page.browser_id}),
      error: function(error) {
        console.log('connection to NaVARgator server lost. The error:', error);
        nvrgtr_page.instance_closed = true;
        clearInterval(nvrgtr_page.maintain_interval_obj);
      }
    });
  }
}
function changeSessionID(new_s_id) {
  var old_s_id = nvrgtr_page.session_id;
  nvrgtr_page.session_id = new_s_id;
  $.ajax({
    url: daemonURL('/instance-closed'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify({'session_id':old_s_id, 'browser_id':nvrgtr_page.browser_id}),
    error: function(error) {
      console.log("Error closing your instance:");
      console.log(error);
    }
  });
}
function closeInstance() {
  nvrgtr_page.instance_closed = true;
  clearInterval(nvrgtr_page.maintain_interval_obj);
  $.ajax({
    url: daemonURL('/instance-closed'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'browser_id': nvrgtr_page.browser_id}),
    async: false, // Makes a huge difference ensuring that this ajax call actually happens
    error: function(error) {
      console.log("Error closing your instance:");
      console.log(error);
    }
  });
}

// =====  Functions to calculate and warn about colour choices:
function getJscolorValue(jscolor_id) {
  // Written to allow for jscolor with required=false. For those, '#'+jscolor returns the previous colour if the input has been deleted, and I want to use the deleted state.
  var jscolor = $(jscolor_id)[0].jscolor, colour = ('#'+jscolor).toUpperCase(),
    input_val = $(jscolor_id).val().toUpperCase();
  if (colour != '#'+input_val && colour != input_val) { // Input has been deleted or is bad
    jscolor.fromString('FFFFFF');
    $(jscolor_id).val('');
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
  clearTree();
  $("#treeLoadingMessageGroup").show();
}
function redrawTree() {
  // Overwritten in input.js and results.js to redraw the tree and reset visible elements.
}
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
  //document.body.appendChild(download_link); // TESTING should be able to remove these 2 lines
  download_link.click();
  //document.body.removeChild(download_link); // TESTING should be able to remove these 2 lines
}
function focusScrollSelectInTextarea(textarea, start, end) {
  // textarea is the jquery object, start and end are integers representing character counts. Will select the given range, and attempt to scroll the textarea so that the selected text is on the bottom of the view.
  textarea.focus();
  var full_text = textarea.val();
  textarea.val(full_text.slice(0, end));
  textarea.scrollTop(0);
  textarea.scrollTop(textarea[0].scrollHeight);
  textarea.val(full_text);
  textarea[0].setSelectionRange(start, end);
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
function setupCoreHelpButtonText() {
  // Display options help:
  $("#displayOptsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
  // Selection groups help:
  $("#selectionGroupsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
}
