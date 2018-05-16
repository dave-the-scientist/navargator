// core.js then core_tree_functions.js are loaded before this file.

// TODO:
// - Change #chosenLabel etc to divs containing the label as it is, plus another of "X". The X should be very faint on mouseout, turn to black on mouseover of the div, and turn to red (or border is red, w/e) on mouseover of itself. Clicking should clear that assigned group.
//   - Nothing relies on #chosenLabel etc being labels, so there shouldnt be anything to do to switch it to a div.
//   - This option also gives me a longer tail on the coloured underline, which looks good.
// - If there are none selected, the chosen etc update buttons should read 'clear' instead. Unless the chosen list is empty, at which it should still say update.
//   - Or, if the user clicks on the chosen label, then the button switches to 'clear'. Which is more intuitive?
// - Would be nice to have a graph showing the total score for each number of clusters. Have it show up in the 'Repvar results pages' box, once you cluster 3 or more. Would help select useful number.

// =====  Modified common variables:
repvar.result_links = {}, repvar.assigned_selected = '';
repvar.opts.sizes.bar_chart_height = 0, repvar.opts.sizes.bar_chart_buffer = 0;
// Adds repvar.nodes[var_name].variant_select_label

// =====  Page setup:
function setupPage() {
  $(".jq-ui-button").button(); // Converts html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
  page.session_id = location.search.slice(1);
  page.browser_id = generateBrowserId(10);
  var tree_width_str = getComputedStyle(document.getElementById("mainTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  setupTreeElements();
  setupRunOptions();
  setupVariantSelection();
  setupUploadSaveButtons();

  if (page.session_id != '') {
    // This is only run for the local version.
    $.ajax({
      url: daemonURL('/get-input-data'),
      type: 'POST',
      data: {'session_id': page.session_id},
      success: function(data_obj) {
        newTreeLoaded(data_obj);
      },
      error: function(error) { processError(error, "Error loading input data from the server"); }
    });
  }
}
function setupUploadSaveButtons() {
  $("#uploadFileButton").button('disable');
  $("#saveRepvarButton").button('disable');

  $("#uploadFileInput").change(function() {
    if ($("#uploadFileInput")[0].files[0]) {
      $("#uploadFileButton").button('enable');
    } else {
      $("#uploadFileButton").button('disable');
    }
  });
  $("#uploadFileButton").click(function() {
    var file_obj = $("#uploadFileInput")[0].files[0];
    if (!file_obj) {
      showErrorPopup("No file selected.");
      return false;
    } else if (file_obj.size > page.max_upload_size) {
      showErrorPopup("The selected file exceeds the maximum upload size.");
      return false;
    }
    var form_data = new FormData($('#uploadFilesForm')[0]), upload_url = '';
    form_data.append('session_id', page.session_id);
    // Should have a drop-down to allow user to specify file type. Upon picking file, filename should be examined to automatically guess file type. Initially repvar and newick, but probably add phyloXML, etc.
    if (file_obj.name.toLowerCase().endsWith('.repvar')) {
      upload_url = daemonURL('/upload-repvar-file');
    } else {
      upload_url = daemonURL('/upload-newick-tree');
    }
    $.ajax({
      type: 'POST',
      url: upload_url,
      data: form_data,
      contentType: false,
      cache: false,
      processData: false,
      success: function(data_obj) {
        // Change title of tree pane to filename = $("#uploadFileInput")[0].files[0].name
        newTreeLoaded(data_obj);
      },
      error: function(error) {
        processError(error, "Error uploading files");
      }
    });
  });
  $("#saveRepvarButton").click(function() {
    $.ajax({
      url: daemonURL('/save-repvar-file'),
      type: 'POST',
      data: {'session_id': page.session_id, 'chosen':repvar.chosen, 'available':repvar.available, 'ignored':repvar.ignored},
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        page.session_id = data.session_id;
        if (data.saved_locally == true) {
          console.log('file saved locally');
        } else {
          saveDataString(data.repvar_as_string, 'web_tree.repvar', 'text/plain');
        }
      },
      error: function(error) { processError(error, "Error saving repvar file"); }
    });
  });
}
function setupRunOptions() {
  $("#numVarSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 3);
  $("#rangeSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1,
    disabled: true
  }).spinner('value', 3);
  $("#rangeCheckbox")[0].checked = false;
  $("#clustMethodSelect").selectmenu();
  //$("#clustMethodSelect").selectmenu('refresh'); Needed if I dynamically modify the menu.

  // Button callbacks:
  $("#rangeCheckbox").change(function() {
    if ($(this).is(':checked')) {
      $("#rangeSpinner").spinner('enable');
    } else {
      $("#rangeSpinner").spinner('disable');
    }
  });
  $("#findVariantsButton").click(function() {
    if (!( validateSpinner($("#numVarSpinner"), "Variants to find") &&
      validateSpinner($("#rangeSpinner"), "Range of variants") )) {
      return false;
    }
    var num_vars = $("#numVarSpinner").spinner('value'), vars_range = num_vars;
    if ($("#rangeCheckbox").is(':checked')) {
      vars_range = $("#rangeSpinner").spinner('value');
      if (vars_range <= num_vars) {
        showErrorPopup("The 'Range of variants' value must be greater than the 'Variants to find' value.");
        return false;
      }
    }
    var num_vars_int = parseInt(num_vars), vars_range_int = parseInt(vars_range),
      cluster_method = $("#clustMethodSelect").val(), do_find_vars = false, first_result_page = null;
    for (var i=num_vars_int; i<=vars_range_int; ++i) {
      if (!repvar.result_links.hasOwnProperty(i)) {
        do_find_vars = true;
      }
    }
    if (do_find_vars == false) {
      return false;
    }
    var auto_open = ($("#autoOpenCheckbox").is(':checked'));
    if (auto_open == true) {
      // Have to open the page directly from the user's click to avoid popup blockers.
      first_result_page = window.open('', '_blank');
    }
    $.ajax({
      url: daemonURL('/find-variants'),
      type: 'POST',
      data: {'session_id': page.session_id, 'chosen':repvar.chosen, 'available':repvar.available, 'ignored':repvar.ignored, 'cluster_method':cluster_method, 'num_vars':num_vars, 'vars_range':vars_range},
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        var new_s_id = data.session_id, runs_began = data.runs_began;
        if (new_s_id != page.session_id) {
          page.session_id = new_s_id;
          clearHideResultsPane();
        }
        if (runs_began.length > 0) {
          updateResultsPane(runs_began);
          if (auto_open == true && first_result_page != null) {
            first_result_page.location.href = repvar.result_links[runs_began[0]];
          }
        }
      },
      error: function(error) { processError(error, "Server error in finding variants"); }
    });

  });
}
function setupVariantSelection() {
  $("#selectAllButton").click(function() {
    var var_name;
    for (var i=0; i<repvar.leaves.length; ++i) {
      var_name = repvar.leaves[i];
      nodeLabelMouseclickHandler(var_name, false, true);
    }
    numSelectedCallback();
  });
  $("#clearSelectionButton").click(function() {
    var var_name;
    for (var i=0; i<repvar.leaves.length; ++i) {
      var_name = repvar.leaves[i];
      nodeLabelMouseclickHandler(var_name, false, false);
    }
    numSelectedCallback();
  });
  addAssignedLabelHandlers($("#chosenLabel"), 'chosen');
  addAssignedLabelHandlers($("#availLabel"), 'available');
  addAssignedLabelHandlers($("#ignoredLabel"), 'ignored');
  $("#chosenUpdateButton").click(function() {
    repvar.chosen = Object.keys(repvar.selected);
    repvar.available = $.grep(repvar.available, function(n, i) { return !(n in repvar.selected) });
    repvar.ignored = $.grep(repvar.ignored, function(n, i) { return !(n in repvar.selected) });
    $("#clearSelectionButton").click();
    updateRunOptions();
  });
  $("#availUpdateButton").click(function() {
    repvar.chosen = $.grep(repvar.chosen, function(n, i) { return !(n in repvar.selected) });
    repvar.available = Object.keys(repvar.selected);
    repvar.ignored = $.grep(repvar.ignored, function(n, i) { return !(n in repvar.selected) });
    $("#clearSelectionButton").click();
    updateRunOptions();
  });
  $("#ignoreUpdateButton").click(function() {
    repvar.chosen = $.grep(repvar.chosen, function(n, i) { return !(n in repvar.selected) });
    repvar.available = $.grep(repvar.available, function(n, i) { return !(n in repvar.selected) });
    repvar.ignored = Object.keys(repvar.selected);
    $("#clearSelectionButton").click();
    updateRunOptions();
  });
}
$(document).ready(function(){
  // Called once the document has loaded.
  setTimeout(setupPage, 10); // setTimeout is used because otherwise the setInterval call sometimes hangs. I think it's due to the page not being ready when the call happens.
});
$(window).bind('beforeunload', function() {
  // Lets the background server know this instance has been closed.
  closeInstance();
});

// =====  Page udating:
function newTreeLoaded(data_obj) {
  parseRepvarData(data_obj);
  clearInterval(page.maintain_interval_obj);
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  if (repvar.tree_data) {
    drawTree();
    updateVarSelectList();
    updateRunOptions();
    $("#uploadFileInput").val('');
    $("#saveRepvarButton").button('enable');
    $("#uploadFileButton").button('disable');
    clearHideResultsPane();
  }
}
function updateVarSelectList() {
  // Updates the list of variants in the selection pane. Should be called every time the phylogenetic tree is modified.
  $('#varSelectDiv > .var-select-label').remove();
  var var_name, short_name, label;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];

    if (var_name.length > repvar.opts.sizes.max_variant_name_length) {
      short_name = var_name.slice(0, repvar.opts.sizes.max_variant_name_length);
      label = $('<label name="'+var_name+'" class="var-select-label" title="'+var_name+'">'+short_name+'</label>');
    } else {
      label = $('<label name="'+var_name+'" class="var-select-label">'+var_name+'</label>');
    }
    $("#varSelectDiv").append(label);
    repvar.nodes[var_name].variant_select_label = label;
    addVariantLabelCallbacks(label, var_name);
  }
  $("#chosenLabel").css('border-color', repvar.opts.colours['chosen']);
  $("#availLabel").css('border-color', repvar.opts.colours['available']);
  $("#ignoredLabel").css('border-color', repvar.opts.colours['ignored']);
  $("#numVariantsSpan").html(repvar.leaves.length);
  $("#mainVariantSelectDiv").show();
}
function updateRunOptions() {
  // Updates the max on the number of variants spinner, and the labels of the choose available and ignored variant buttons. Should be called every time the available or ignored variants are modified.
  var maxVars = repvar.chosen.length + repvar.available.length;
  if (maxVars == 0) {
    maxVars = null;
  }
  $("#numVarSpinner").spinner('option', 'max', maxVars);
  $("#rangeSpinner").spinner('option', 'max', maxVars);
  $("#numChosenSpan").html(repvar.chosen.length);
  $("#numAvailSpan").html(repvar.available.length);
  $("#numIgnoredSpan").html(repvar.ignored.length);
  updateCAIVariantMarkers();
  clearHideResultsPane();
}
function updateCAIVariantMarkers() {
  // CAI stands for chosen, available, ignored.
  var var_name, circle, circle_radius, colour_key;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];
    circle = repvar.nodes[var_name].circle;
    circle_radius = repvar.opts.sizes.big_marker_radius;
    if (repvar.chosen.indexOf(var_name) != -1) {
      colour_key = 'chosen';
    } else if (repvar.available.indexOf(var_name) != -1) {
      colour_key = 'available';
    } else if (repvar.ignored.indexOf(var_name) != -1) {
      colour_key = 'ignored';
    } else {
      colour_key = 'node';
      circle_radius = repvar.opts.sizes.small_marker_radius;
    }
    changeNodeStateColour(var_name, circle, 'node_rest', colour_key);
    circle.attr({'r':circle_radius});
    $(".var-select-label[name='"+var_name+"'").css('border-color', repvar.opts.colours[colour_key]);
  }
}
function clearHideResultsPane() {
  repvar.result_links = {};
  $("#resultsLinksDiv").hide();
  $(".result-link-li").remove();
}
function updateResultsPane(runs_began) {
  var var_num, results_url, result_description, result_link_obj;
  for (var i=0; i<runs_began.length; ++i) {
    var_num = runs_began[i];
    results_url = page.server_url + '/results?' + page.session_id + '_' + var_num;
    result_description = var_num + ' representative variants';
    result_link_obj = $('<a>', {
      text:result_description, title:result_description, href:results_url, target:'_blank'
    }).wrap('<li class="result-link-li">').parent();
    $("#resultsLinksList").append(result_link_obj);
    repvar.result_links[var_num] = results_url;
  }
  $("#resultsLinksDiv").show();
}

// =====  Callback and event handlers:
function addAssignedLabelHandlers(label_ele, assigned_key) {
  label_ele.mouseenter(function() {
    label_ele.css('background', repvar.opts.colours.cluster_highlight);
    for (var i=0; i<repvar[assigned_key].length; ++i) {
      nodeLabelMouseoverHandler(repvar[assigned_key][i]);
    }
  }).mouseleave(function() {
    if (repvar.assigned_selected == assigned_key) {
      label_ele.css('background', repvar.opts.colours.selection);
    } else {
      label_ele.css('background', '');
    }
    for (var i=0; i<repvar[assigned_key].length; ++i) {
      nodeLabelMouseoutHandler(repvar[assigned_key][i]);
    }
  }).click(function() {
    var full_select = (repvar.assigned_selected != assigned_key);
    if (full_select) {
      label_ele.css('background', repvar.opts.colours.selection);
    } else {
      label_ele.css('background', repvar.opts.colours.cluster_highlight);
    }
    for (var i=0; i<repvar[assigned_key].length; ++i) {
      nodeLabelMouseclickHandler(repvar[assigned_key][i], false, full_select);
    }
    numSelectedCallback();
    if (full_select) {
      repvar.assigned_selected = assigned_key;
    }
  });
}
function nodeLabelMouseoverHandlerCallback(var_name, label_colour) {
  repvar.nodes[var_name].variant_select_label.css('background', label_colour);
}
function nodeLabelMouseoutHandlerCallback(var_name, label_colour) {
  repvar.nodes[var_name].variant_select_label.css('background', label_colour);
}
function nodeLabelMouseclickHandlerCallback(var_name, label_colour) {
  repvar.nodes[var_name].variant_select_label.css('background', label_colour);
}
function numSelectedCallback() {
  // Update span indicating number of selected variants:
  $("#currentSelectionNum").html(repvar.num_selected);
  // Update assigned labels and controlling variable:
  if (repvar.assigned_selected == 'chosen') {
    $("#chosenLabel").css('background', '');
  } else if (repvar.assigned_selected == 'available') {
    $("#availLabel").css('background', '');
  } else if (repvar.assigned_selected == 'ignored') {
    $("#ignoredLabel").css('background', '');
  }
  repvar.assigned_selected = '';
}
function addVariantLabelCallbacks(jq_ele, var_name) {
  jq_ele.mouseenter(function() {
    nodeLabelMouseoverHandler(var_name);
  }).mouseleave(function() {
    nodeLabelMouseoutHandler(var_name);
  }).click(function() {
    nodeLabelMouseclickHandler(var_name);
  });
}

// =====  Data parsing:
function parseRepvarData(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.session_id;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
  repvar.chosen = data.chosen;
  repvar.available = data.available;
  repvar.ignored = data.ignored;
  if (data.hasOwnProperty('maintain_interval') && data.maintain_interval != page.maintain_interval*1000) {
    maintainServer();
    page.maintain_interval = data.maintain_interval * 1000;
    clearInterval(page.maintain_interval_obj);
    page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  }
}
