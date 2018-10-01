// core.js then core_tree_functions.js are loaded before this file.

// TODO:
// - Finish display options in core.js
// - The control elements are hiding internal borders between neighbouring buttons, and the toggle buttons do not. Neither is great. The toggle borders are too thick (they're doubled up), and the control elements only highlight on 3 sides (except some).
//   - I think the best solution is to use an outline for the shared borders (as they don't take up space), and change the z-index of the button on hover (so all 4 sides are visible) in addition to darkening the colour.
// - After I've re-done the session file format, ensure setupUploadSaveButtons() handles the new suffixes.
// - After the session file format is ready, make it save the user's display options.
//   - These options should also be passed to the server and then to results.js as defaults.
// - Should be a button to clear the results pane. Should also clear vf.normalize, but not wipe the cache. This will allow the user to specify what graph is shown and the global normalization, without requiring the clustering to be re-done. Especially important once nvrgtr files actually save clustering results too.
// - The header needs some finishing design work. I'd like to incorporate more green, but should wait for the icon to be finished first.
// - I quite like how the toggle button came out. Use that to style my buttons instead of relying on jqueryui.
// - The tree on the results page looks more cohesive, because it's incorporating colours from the page. The input tree looks better now with the header. Maybe make a circular gradient from the middle of the input tree, in the cluster colour. Probably not necessary though.
// - I could re-design the select all / clear button group. Maybe button starts as "[All | X]"; on mouseover of left, the dividing border could move to the right, making "X" smaller and changing text to "Select all"; likewise on mouseover of right side, it expands and the left button shrinks.
//   - Could be 'none' instead of 'clear'.
// - I love the simple animations on hover. Would be great if I find a use for them (from the answer of https://stackoverflow.com/questions/30681684/animated-toggle-button-for-mobile)
// - In display options, make sure there's the option for max length of displayed names.

//NOTE:
// - If the underlying vf is replaced, have to call setNormalizationMethod() to inform the new vf of the user's choice.
//   - This info is not retained when the new vf is created. I believe the only current points are on loading a new file (either from the button or the automatic load at the start), and when finding variants if any of the assigned variants have changed. Those are all currently covered.

// =====  Modified common variables:
$.extend(nvrgtr_page, {
  'page':'input', 'check_results_timer':null, 'check_results_interval':500
});
$.extend(nvrgtr_data, {
  'result_links':{'var_nums':[], 'scores':[]}, 'assigned_selected':'', 'assigned_added':'',
  'graph':{'g':null, 'x_fxn':null, 'y_fxn':null, 'line_fxn':null, 'x_axis':null, 'y_axis':null}
});
$.extend(nvrgtr_settings.graph, {
  'margin':{top:7, right:27, bottom:35, left:37}
});
// Also adds nvrgtr_data.nodes[var_name].variant_select_label

// =====  Page setup:
function setupPage() {
  initializeButtons();
  initializeErrorPopupWindow();
  initializeCollapsibleElements();
  initializeFloatingPanes();
  nvrgtr_page.session_id = location.search.slice(1);
  nvrgtr_page.browser_id = generateBrowserId(10);
  console.log('sessionID:'+nvrgtr_page.session_id+', browserID:'+nvrgtr_page.browser_id);
  //var tree_width_str = $("#mainTreeDiv").css('width');
  //nvrgtr_display_opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  var score_graph_width_str = $("#scoreGraphSvg").css('width');
  nvrgtr_settings.graph.total_width = parseInt(score_graph_width_str.slice(0,-2));
  var score_graph_height_str = $("#scoreGraphSvg").css('height');
  nvrgtr_settings.graph.total_height = parseInt(score_graph_height_str.slice(0,-2));
  setupTreeElements();
  setupDisplayOptionsPane();
  setupNormalizationPane();
  setupRunOptions();
  setupScoresGraph();
  setupVariantSelection();
  setupUploadSaveButtons();

  if (nvrgtr_page.session_id != '') {
    // This is only run for the local version.
    $.ajax({
      url: daemonURL('/get-basic-data'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({'session_id': nvrgtr_page.session_id}),
      success: function(data_obj) {
        if (!newTreeLoaded(data_obj)) {  // If no session file loaded:
          $("#loadInputHeader").click(); //   open collapsible pane.
        }
      },
      error: function(error) { processError(error, "Error loading input data from the server"); }
    });
  } else {
    $("#loadInputHeader").click(); // Opens collapsible pane
  }
}
function setupUploadSaveButtons() {
  var file_input = $("#uploadFileInput"), upload_button = $("#uploadFileButton"), upload_type_select = $("#uploadFileTypeSelect"), save_button = $("#saveSessionButton");
  upload_button.button('disable');
  save_button.button('disable');

  file_input.change(function() {
    var file_obj = file_input[0].files[0];
    if (file_obj) {
      var filename = file_obj.name,
        suffix = parseFileSuffix(filename);
      if (suffix == 'nvrgtr') {
        upload_type_select.val('nvrgtr');
      } else if (suffix == 'nwk' || suffix == 'tree') {
        upload_type_select.val('newick');
      } else if (suffix == 'xml') {
        upload_type_select.val('phyloxml');
      }
      upload_button.button('enable');
    } else {
      upload_button.button('disable');
    }
  });
  upload_button.click(function() {
    var file_obj = file_input[0].files[0];
    if (!file_obj) {
      showErrorPopup("No file selected.");
      return false;
    } else if (file_obj.size > nvrgtr_page.max_upload_size) {
      showErrorPopup("The selected file exceeds the maximum upload size.");
      return false;
    }
    var form_data = new FormData($('#uploadFilesForm')[0]), upload_url = '';
    form_data.append('session_id', nvrgtr_page.session_id);
    var selected_file_type = upload_type_select.val();
    if (selected_file_type == 'nvrgtr') {
      upload_url = daemonURL('/upload-nvrgtr-file');
    } else if (selected_file_type == 'newick') {
      upload_url = daemonURL('/upload-newick-tree');
    } else if (selected_file_type == 'phyloxml') {
      showErrorPopup("The PhyloXML tree format is not yet supported by NaVARgator.");
      return false;
    } else {
      showErrorPopup("No file type was selected for the input file. Please specify it and load the file again.");
      return false;
    }
    $.ajax({
      type: 'POST',
      url: upload_url,
      contentType: false, // Not using contentType: "application/json" here,
      data: form_data, //    or JSON.stringify here, as it's sending files.
      cache: false,
      processData: false,
      success: function(data_obj) {
        newTreeLoaded(data_obj);
      },
      error: function(error) {
        processError(error, "Error uploading the input file. This may be due to the incorrect file format being specified");
      }
    });
  });
  save_button.click(function() {
    $.ajax({
      url: daemonURL('/save-nvrgtr-file'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'chosen':nvrgtr_data.chosen, 'available':nvrgtr_data.available, 'ignored':nvrgtr_data.ignored, 'display_opts':nvrgtr_display_opts}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        nvrgtr_page.session_id = data.session_id;
        if (data.saved_locally == true) {
          console.log('file saved locally');
        } else {
          saveDataString(data.nvrgtr_as_string, 'web_tree.nvrgtr', 'text/plain');
        }
      },
      error: function(error) { processError(error, "Error saving session file"); }
    });
  });
}
function setupNormalizationPane() {
  var go_button_shown = false;
  var self_radio = $("#normSelfRadio"), global_radio = $("#normGlobalRadio"), custom_radio = $("#normValRadio");
  var custom_input = $("#normValInput"), custom_go_button = $("#normValGoButton");
  custom_input.data('prev_val', '');
  function showGoButton() {
    if (go_button_shown == false) {
      custom_go_button.show(100);
      go_button_shown = true;
    }
  }
  function hideGoButton() {
    if (go_button_shown == true) {
      custom_go_button.hide(100);
      go_button_shown = false;
    }
  }
  self_radio.on("change", function(event) {
    hideGoButton();
    setNormalizationMethod();
  });
  global_radio.on("change", function(event) {
    hideGoButton();
    setNormalizationMethod();
  });
  custom_radio.click(function(event) {
    var val = custom_input.val();
    if (val == '') {
      custom_input.focus();
      return false; // Prevents the button from being actually selected.
    }
  }).on("change", function(event) {
    custom_go_button.click();
  });
  custom_input.on("keydown", function(event) {
    if (event.which == 13) { // 'Enter' key
      custom_input.blur();
      custom_go_button.click();
      return false;
    }
    showGoButton();
  }).blur(function(event) {
    var val = parseFloat(custom_input.val());
    if (isNaN(val)) {
      val = '';
    }
    if (val == custom_input.data('prev_val')) {
      hideGoButton();
    }
    custom_input.val(val);
  });
  custom_go_button.click(function(event) {
    hideGoButton();
    var val = custom_input.val();
    if (val != '' && val <= 0) {
      showErrorPopup("Error: the 'normalize to' value must be a positive number.");
      val = '';
      custom_input.val('');
    }
    custom_input.data('prev_val', val);
    if (val == '') {
      if (custom_radio.is(':checked')) {
        self_radio.prop('checked', true).change();
      }
      return false;
    }
    custom_radio.prop('checked', true);
    setNormalizationMethod();
  });
}
function setupRunOptions() {
  $("#numVarSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 2);
  $("#rangeSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 3);
  $("#numVarSpinner").on('spin', function(event, ui) {
    var cur_val = ui.value,
      range_spin = $("#rangeSpinner"), range_val = range_spin.spinner('value');
    if (cur_val > range_val) {
      range_spin.spinner('value', cur_val);
    }
  });
  $("#rangeSpinner").on('spin', function(event, ui) {
    var cur_val = ui.value,
      single_spin = $("#numVarSpinner"), single_val = single_spin.spinner('value');
    if (cur_val < single_val) {
      single_spin.spinner('value', cur_val);
    }
  });
  $(".multiple-run-only").css('visibility', 'hidden');
  $("#rangeSpinner").parent().css('visibility', 'hidden');
  $("#clustMethodSelect").selectmenu();
  //$("#clustMethodSelect").selectmenu('refresh'); Needed if I dynamically modify the menu.

  // Button callbacks:
  $("#singleRunCheckbox, #multipleRunCheckbox").change(function() {
    if ($("#singleRunCheckbox").is(':checked')) {
      $(".single-run-only").css('visibility', 'visible');
      $(".multiple-run-only").css('visibility', 'hidden');
      $("#rangeSpinner").parent().css('visibility', 'hidden');
    } else {
      $(".single-run-only").css('visibility', 'hidden');
      $(".multiple-run-only").css('visibility', 'visible');
      $("#rangeSpinner").parent().css('visibility', 'visible');
    }
  });

  $("#findVariantsButton").click(function() {
    var ret = validateFindVariantsCall();
    if (ret == false) {
      return false;
    }
    var num_vars = ret.num_vars, num_vars_range = ret.num_vars_range,
      cluster_method = $("#clustMethodSelect").val();
    var auto_open = ($("#singleRunCheckbox").is(':checked') && $("#autoOpenCheckbox").is(':checked')),
      auto_result_page = null;
    if (auto_open == true) {
      // Have to open the page directly from the user's click to avoid popup blockers.
      auto_result_page = window.open('', '_blank');
    }
    $.ajax({
      url: daemonURL('/find-variants'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'chosen':nvrgtr_data.chosen, 'available':nvrgtr_data.available, 'ignored':nvrgtr_data.ignored, 'cluster_method':cluster_method, 'num_vars':num_vars, 'num_vars_range':num_vars_range, 'display_opts':nvrgtr_display_opts}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        var new_s_id = data.session_id;
        if (new_s_id != nvrgtr_page.session_id) {
          nvrgtr_page.session_id = new_s_id;
          setNormalizationMethod();
          clearHideResultsPane();
        }
        updateResultsPane(num_vars, num_vars_range);
        if (auto_open == true && auto_result_page != null) {
          auto_result_page.location.href = nvrgtr_data.result_links[num_vars].url;
        }
      },
      error: function(error) { processError(error, "Server error in finding variants"); }
    });
  });
}
function setupScoresGraph() {
  var total_width = nvrgtr_settings.graph.total_width, total_height = nvrgtr_settings.graph.total_height, margin = nvrgtr_settings.graph.margin, width = total_width - margin.left - margin.right, height = total_height - margin.top - margin.bottom;
  // Set up svg and g objects:
  var svg = d3.select("#scoreGraphSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  nvrgtr_data.graph.g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up graphing functions:
  nvrgtr_data.graph.x_fxn = d3.scaleLinear()
    .range([0, width]);
  nvrgtr_data.graph.y_fxn = d3.scaleLinear()
    .range([height, 0]);
  nvrgtr_data.graph.line_fxn = d3.line()
    .x(function(d,i) { return nvrgtr_data.graph.x_fxn(nvrgtr_data.result_links.var_nums[i]); })
    .y(function(d,i) { return nvrgtr_data.graph.y_fxn(d); });
  // Set up graph axes:
  nvrgtr_data.graph.x_axis = d3.axisBottom(nvrgtr_data.graph.x_fxn)
    .tickFormat(d3.format("d"));
  nvrgtr_data.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + height + ")")
    .call(nvrgtr_data.graph.x_axis);
  nvrgtr_data.graph.y_axis = d3.axisLeft(nvrgtr_data.graph.y_fxn)
    .tickFormat(d3.format("d"));
  nvrgtr_data.graph.g.append("g")
    .attr("class", "y-axis")
    .call(nvrgtr_data.graph.y_axis);
  // Set up axis labels:
  nvrgtr_data.graph.g.append("text") // x axis
    .attr("class", "score-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 30)
    .text("Number of clusters");
  nvrgtr_data.graph.g.append("text") // y axis
    .attr("class", "score-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", 0 - height/2)
    .attr("y", 0 - 23)
    .attr("transform", "rotate(-90)")
    .text("Tree score");
  // Set up the graph line:
  nvrgtr_data.graph.g.append("path")
    .attr("class", "score-line");
}
function setupVariantSelection() {
  var avail_assigned_div = $("#availAssignedDiv"), chosen_assigned_div = $("#chosenAssignedDiv"), ignored_assigned_div = $("#ignoredAssignedDiv");
  addAssignedLabelHandlers(avail_assigned_div, 'available');
  addAssignedLabelHandlers(chosen_assigned_div, 'chosen');
  addAssignedLabelHandlers(ignored_assigned_div, 'ignored');
  var add_avail_button = $("#addAvailButton"), add_chosen_button = $("#addChosenButton"), add_ignored_button = $("#addIgnoredButton");
  addAssignedButtonTitleStrings(add_avail_button, 'available');
  addAssignedButtonTitleStrings(add_chosen_button, 'chosen');
  addAssignedButtonTitleStrings(add_ignored_button, 'ignored');
  add_avail_button.click(function(event) {
    var added_key = (nvrgtr_data.assigned_added == 'available') ? '' : 'available',
      selected_names = Object.keys(nvrgtr_data.selected);
    if (added_key != '') { /* Add selected to assigned.*/
      nvrgtr_data.available.push(...selected_names);
      nvrgtr_data.available = [...new Set(nvrgtr_data.available)];
      nvrgtr_data.chosen = $.grep(nvrgtr_data.chosen, function(n, i) { return !(n in nvrgtr_data.selected) });
      nvrgtr_data.ignored = $.grep(nvrgtr_data.ignored, function(n, i) { return !(n in nvrgtr_data.selected) });
    } else { /* Remove selected from assigned.*/
      nvrgtr_data.available = $.grep(nvrgtr_data.available, function(n, i) { return !(n in nvrgtr_data.selected) });
    }
    addAssignedButtonHandler(event, add_avail_button, added_key, selected_names);
  });
  add_chosen_button.click(function(event) {
    var added_key = (nvrgtr_data.assigned_added == 'chosen') ? '' : 'chosen',
      selected_names = Object.keys(nvrgtr_data.selected);
    if (added_key != '') { /* Add selected to assigned.*/
      nvrgtr_data.chosen.push(...selected_names);
      nvrgtr_data.chosen = [...new Set(nvrgtr_data.chosen)];
      nvrgtr_data.available = $.grep(nvrgtr_data.available, function(n, i) { return !(n in nvrgtr_data.selected) });
      nvrgtr_data.ignored = $.grep(nvrgtr_data.ignored, function(n, i) { return !(n in nvrgtr_data.selected) });
    } else { /* Remove selected from assigned.*/
      nvrgtr_data.chosen = $.grep(nvrgtr_data.chosen, function(n, i) { return !(n in nvrgtr_data.selected) });
    }
    addAssignedButtonHandler(event, add_chosen_button, added_key, selected_names);
  });
  add_ignored_button.click(function(event) {
    var added_key = (nvrgtr_data.assigned_added == 'ignored') ? '' : 'ignored',
      selected_names = Object.keys(nvrgtr_data.selected);
    if (added_key != '') { /* Add selected to assigned.*/
      nvrgtr_data.ignored.push(...selected_names);
      nvrgtr_data.ignored = [...new Set(nvrgtr_data.ignored)];
      nvrgtr_data.chosen = $.grep(nvrgtr_data.chosen, function(n, i) { return !(n in nvrgtr_data.selected) });
      nvrgtr_data.available = $.grep(nvrgtr_data.available, function(n, i) { return !(n in nvrgtr_data.selected) });
    } else { /* Remove selected from assigned.*/
      nvrgtr_data.ignored = $.grep(nvrgtr_data.ignored, function(n, i) { return !(n in nvrgtr_data.selected) });
    }
    addAssignedButtonHandler(event, add_ignored_button, added_key, selected_names);
  });
  $("#clearAvailButton").click(function(event) {
    clearAssignedButtonHandler(event, 'available', avail_assigned_div);
  });
  $("#clearChosenButton").click(function(event) {
    clearAssignedButtonHandler(event, 'chosen', chosen_assigned_div);
  });
  $("#clearIgnoredButton").click(function(event) {
    clearAssignedButtonHandler(event, 'ignored', ignored_assigned_div);
  });
}
$(document).ready(function(){
  // Called once the document has loaded.
  setTimeout(setupPage, 10); // setTimeout is used because otherwise the setInterval call sometimes hangs. I think it's due to the page not being ready when the call happens. I no longer believe that, and I think those issues were caused by the html document loading the js files asynch. Should be fixed now.
});
$(window).bind('beforeunload', function() {
  // Lets the background server know this instance has been closed.
  closeInstance();
});

// =====  Page udating:
function newTreeLoaded(data_obj) {
  // Returns true if a tree was loaded, false otherwise.
  parseBasicData(data_obj);
  clearInterval(nvrgtr_page.maintain_interval_obj);
  nvrgtr_page.maintain_interval_obj = setInterval(maintainServer, nvrgtr_page.maintain_interval);
  if (nvrgtr_data.tree_data) {
    setNormalizationMethod();
    $("#introMessageGroup").remove();
    $("#treeSelectionDiv").show();
    $("#treeControlsDiv").show();
    $("#treeLegendLeftGroup").show();
    redrawTree();
    $("#uploadFileInput").val('');
    $("#saveSessionButton").button('enable');
    $("#uploadFileButton").button('disable');
    clearHideResultsPane();
    return true;
  } else {
    return false;
  }
}
function redrawTree() {
  // if nvrgtr_display_opts.sizes.tree is different from the default value, need to modify the css width and height here.
  drawTree();
  updateVarSelectList();
  updateRunOptions();
}
function updateVarSelectList() {
  // Updates the list of variants in the selection pane. Should be called every time the phylogenetic tree is modified.
  $('#varSelectDiv > .var-select-label').remove();
  var var_name, short_name, label;
  for (var i=0; i<nvrgtr_data.leaves.length; ++i) {
    var_name = nvrgtr_data.leaves[i];
    if (var_name.length > nvrgtr_display_opts.sizes.max_variant_name_length) {
      short_name = var_name.slice(0, nvrgtr_display_opts.sizes.max_variant_name_length);
      label = $('<label name="'+var_name+'" class="var-select-label prevent-text-selection" title="'+var_name+'">'+short_name+'</label>');
    } else {
      label = $('<label name="'+var_name+'" class="var-select-label prevent-text-selection">'+var_name+'</label>');
    }
    $("#varSelectDiv").append(label);
    nvrgtr_data.nodes[var_name].variant_select_label = label;
    addVariantLabelCallbacks(label, var_name);
  }
  $("#chosenAssignedDiv").css('border-color', nvrgtr_display_opts.colours.chosen);
  $("#availAssignedDiv").css('border-color', nvrgtr_display_opts.colours.available);
  $("#ignoredAssignedDiv").css('border-color', nvrgtr_display_opts.colours.ignored);
  $("#numVariantsSpan").html(nvrgtr_data.leaves.length);
  $("#mainVariantSelectDiv").show();
}
function updateRunOptions() {
  // Updates the max on the number of variants spinner, and the labels of the choose available and ignored variant buttons. Should be called every time the available or ignored variants are modified.
  var maxVars = nvrgtr_data.chosen.length + nvrgtr_data.available.length;
  if (maxVars < 2) {
    maxVars = nvrgtr_data.leaves.length - nvrgtr_data.ignored.length;
  }
  if ($("#numVarSpinner").spinner('value') > maxVars) {
    $("#numVarSpinner").spinner('value', maxVars);
  }
  if ($("#rangeSpinner").spinner('value') > maxVars) {
    $("#rangeSpinner").spinner('value', maxVars);
  }
  $("#numVarSpinner").spinner('option', 'max', maxVars);
  $("#rangeSpinner").spinner('option', 'max', maxVars);
  $("#numChosenSpan").html(nvrgtr_data.chosen.length);
  $("#numAvailSpan").html(nvrgtr_data.available.length);
  $("#numIgnoredSpan").html(nvrgtr_data.ignored.length);
  updateCAIVariantMarkers();
  clearHideResultsPane();
}
function updateCAIVariantMarkers() {
  // CAI stands for chosen, available, ignored.
  var var_name, circle, circle_radius, colour_key;
  for (var i=0; i<nvrgtr_data.leaves.length; ++i) {
    var_name = nvrgtr_data.leaves[i];
    circle = nvrgtr_data.nodes[var_name].circle;
    circle_radius = nvrgtr_display_opts.sizes.big_marker_radius;
    if (nvrgtr_data.chosen.indexOf(var_name) != -1) {
      colour_key = 'chosen';
    } else if (nvrgtr_data.available.indexOf(var_name) != -1) {
      colour_key = 'available';
    } else if (nvrgtr_data.ignored.indexOf(var_name) != -1) {
      colour_key = 'ignored';
    } else {
      colour_key = 'default_node';
      circle_radius = nvrgtr_display_opts.sizes.small_marker_radius;
    }
    changeNodeStateColour(var_name, circle, 'node_rest', colour_key);
    circle.attr({'r':circle_radius});
    $(".var-select-label[name='"+var_name+"'").css('border-color', nvrgtr_display_opts.colours[colour_key]);
  }
}
function clearHideResultsPane() {
  nvrgtr_data.result_links = {'var_nums':[], 'scores':[]};
  $("#resultsLinksDiv").hide();
  $("#scoreGraphSvg").hide();
  $(".result-link-li").remove();
}
function updateResultsPane(num_vars, num_vars_range) {
  var results_url, result_description, result_link_obj, result_list_obj,
    links_list = $("#resultsLinksList");
  // Add links for the new runs into the results pane:
  for (var var_num=num_vars; var_num<=num_vars_range; ++var_num) {
    if (nvrgtr_data.result_links.hasOwnProperty(var_num)) { continue; }
    results_url = nvrgtr_page.server_url + '/results?' + nvrgtr_page.session_id + '_' + var_num;
    result_description = var_num + ' clusters';
    result_link_obj = $('<a href="'+results_url+'" title="'+result_description+'" target="_blank">'+result_description+' [processing...]</a>');
    result_list_obj = result_link_obj.wrap('<li class="result-link-li">').parent();
    result_list_obj.attr("variantNumber", var_num);
    links_list.append(result_list_obj);
    nvrgtr_data.result_links[var_num] = {'url':results_url, 'link':result_link_obj, 'score':null};
    nvrgtr_data.result_links.var_nums.push(var_num);
  }
  // Sort the internal representation of the results:
  nvrgtr_data.result_links.var_nums.sort(function(a,b) { return a-b; });
  // Sort all of the links in the results pane:
  var sorted_links = $(".result-link-li").get();
  sorted_links.sort(function(a,b) {
    return $(a).attr("variantNumber") - $(b).attr("variantNumber");
  });
  $.each(sorted_links, function(i, li) {
    links_list.append(li); // Removes li from it's current position in links_list, adds it to the end.
  });
  // Act on the new results list:
  $("#resultsLinksDiv").show();
  clearTimeout(nvrgtr_page.check_results_timer); // In case it's still checking for a previous run.
  checkIfProcessingDone();
}
function checkIfProcessingDone() {
  $.ajax({
    url: daemonURL('/check-results-done'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'var_nums': nvrgtr_data.result_links.var_nums}),
    success: function(data_obj) {
      var data = $.parseJSON(data_obj);
      var ret_var_nums = data.var_nums.map(function(n) { return parseInt(n,10); });
      if (JSON.stringify(ret_var_nums) != JSON.stringify(nvrgtr_data.result_links.var_nums)) {
        console.log('Aborting checkIfProcessingDone(), as the returned list does not match.');
        return false; // RACE CONDITION: Don't update anything, because the user has already re-run the analysis.
      }
      var draw_graph = true, max_var_dist = 0, score, var_num, max_dist;
      for (var i=0; i<data.var_scores.length; ++i) {
        score = data.var_scores[i];
        var_num = ret_var_nums[i];
        if (score == false) {
          draw_graph = false;
        } else if (nvrgtr_data.result_links[var_num].score == null) {
          nvrgtr_data.result_links[var_num].score = score;
          nvrgtr_data.result_links[var_num].link.html(var_num+' clusters ['+roundFloat(score, 4)+']');
          max_dist = parseFloat(data.max_var_dists[i]);
          if (max_dist > max_var_dist) { max_var_dist = max_dist; }
        } else if (nvrgtr_data.result_links[var_num].score != score) {
          showErrorPopup("Error: scores from the server don't match existing scores.");
        }
      }
      if (max_var_dist > 0) {
        calculateGlobalNormalization(max_var_dist); // So results are processed every 0.5 sec.
      }
      if (draw_graph == false) {
        nvrgtr_page.check_results_timer = setTimeout(checkIfProcessingDone, nvrgtr_page.check_results_interval);
      } else {
        nvrgtr_data.result_links.scores = data.var_scores;
        updateScoreGraph();
      }
    },
    error: function(error) { processError(error, "Error checking if the results have finished"); }
  });
}
function updateScoreGraph() {
  if (nvrgtr_data.result_links.var_nums.length == 1) {
    // No action currently taken.
  } else {
    // Update x and y domains:
    var min_var = nvrgtr_data.result_links.var_nums[0],
      max_var = nvrgtr_data.result_links.var_nums[nvrgtr_data.result_links.var_nums.length-1];
    nvrgtr_data.graph.x_fxn.domain(
      [min_var, max_var]
    );
    nvrgtr_data.graph.y_fxn.domain(
      [ Math.floor(d3.min(nvrgtr_data.result_links.scores)),
        Math.ceil(d3.max(nvrgtr_data.result_links.scores)) ]
    );
    // Update x and y axes with the new domains:
    nvrgtr_data.graph.x_axis.tickValues(nvrgtr_data.result_links.var_nums);
    nvrgtr_data.graph.y_axis.tickValues(nvrgtr_data.graph.y_fxn.ticks(3));
    nvrgtr_data.graph.g.select(".x-axis")
      .transition()
      .call(nvrgtr_data.graph.x_axis);
    nvrgtr_data.graph.g.select(".y-axis")
      .transition()
      .call(nvrgtr_data.graph.y_axis);
    // Update the graph line:
    nvrgtr_data.graph.g.select(".score-line")
      .transition()
      .attr("d", function() { return nvrgtr_data.graph.line_fxn(nvrgtr_data.result_links.scores); });
    $("#scoreGraphSvg").show();
  }
}
function updateVariantColoursFollowup() {
  /*Called from core.js when the user changes one of the variant colours.*/
  $("#availAssignedDiv").css('border-color', nvrgtr_display_opts.colours.available);
  $("#chosenAssignedDiv").css('border-color', nvrgtr_display_opts.colours.chosen);
  $("#ignoredAssignedDiv").css('border-color', nvrgtr_display_opts.colours.ignored);
  $.each(nvrgtr_data.nodes, function(name, node) {
    node.variant_select_label.css('border-color', node.node_rest_colour);
  });
}

// =====  Callback and event handlers:
function addAssignedLabelHandlers(label_ele, assigned_key) {
  label_ele.mouseenter(function() {
    var assigned_len = nvrgtr_data[assigned_key].length;
    if (assigned_len == 0) { return false; }
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseoverHandler(nvrgtr_data[assigned_key][i]);
    }
  }).mouseleave(function() {
    var assigned_len = nvrgtr_data[assigned_key].length;
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseoutHandler(nvrgtr_data[assigned_key][i]);
    }
  }).click(function() {
    var assigned_len = nvrgtr_data[assigned_key].length;
    if (assigned_len == 0) { return false; }
    var full_select = (nvrgtr_data.assigned_selected != assigned_key);
    if (full_select) {
      label_ele.addClass('var-assigned-selected');
    } else {
      label_ele.removeClass('var-assigned-selected');
    }
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseclickHandler(nvrgtr_data[assigned_key][i], false, full_select);
    }
    numSelectedCallback();
    if (full_select) {
      nvrgtr_data.assigned_selected = assigned_key;
    }
  });
}
function addAssignedButtonTitleStrings(button_element, assigned_key) {
  button_element.data("add_desc", "Add selection to '"+assigned_key+" variants'.");
  button_element.data("remove_desc", "Remove selection from '"+assigned_key+" variants'.");
  button_element.attr('title', button_element.data('add_desc'));
}
function addAssignedButtonHandler(event, button_element, assigned_key, selected_names) {
  event.stopPropagation();
  if (selected_names.length == 0) { return false; }
  for (var i=0; i<selected_names.length; ++i) {
    if (assigned_key != '') {
      nodeLabelMouseoverHandler(selected_names[i]);
    } else {
      nodeLabelMouseoutHandler(selected_names[i]);
    }
  }
  updateRunOptions();
  numSelectedCallback();
  if (assigned_key != '') {
    // This must be after numSelectedCallback(), as it clears nvrgtr_data.assigned_added
    button_element.addClass('var-assigned-added');
    button_element.attr('title', button_element.data('remove_desc'));
    nvrgtr_data.assigned_added = assigned_key;
  }
}
function clearAssignedButtonHandler(event, assigned_key, assigned_div_element) {
  event.stopPropagation();
  var assigned_len = nvrgtr_data[assigned_key].length;
  if (assigned_len == 0) { return false; }
  for (var i=0; i<assigned_len; ++i) {
    nodeLabelMouseoutHandler(nvrgtr_data[assigned_key][i]);
  }
  nvrgtr_data[assigned_key] = [];
  if (nvrgtr_data.assigned_selected == assigned_key) {
    assigned_div_element.removeClass('var-assigned-selected');
    nvrgtr_data.assigned_selected = '';
  }
  updateRunOptions();
}
function nodeLabelMouseoverHandlerCallback(var_name, label_colour) {
  nvrgtr_data.nodes[var_name].variant_select_label.css('background', label_colour);
}
function nodeLabelMouseoutHandlerCallback(var_name, label_colour) {
  nvrgtr_data.nodes[var_name].variant_select_label.css('background', label_colour);
}
function nodeLabelMouseclickHandlerCallback(var_name, label_colour) {
  nvrgtr_data.nodes[var_name].variant_select_label.css('background', label_colour);
}
function numSelectedCallback() {
  // Update span indicating number of selected variants:
  $("#currentSelectionNum").html(nvrgtr_data.num_selected);
  // Update assigned labels and controlling variable:
  if (nvrgtr_data.assigned_selected == 'chosen') {
    $("#chosenAssignedDiv").removeClass('var-assigned-selected');
  } else if (nvrgtr_data.assigned_selected == 'available') {
    $("#availAssignedDiv").removeClass('var-assigned-selected');
  } else if (nvrgtr_data.assigned_selected == 'ignored') {
    $("#ignoredAssignedDiv").removeClass('var-assigned-selected');
  }
  nvrgtr_data.assigned_selected = '';
  // Update assigned 'add/remove' buttons and controlling variable:
  if (nvrgtr_data.assigned_added != '') {
    var button_element;
    if (nvrgtr_data.assigned_added == 'available') {
      button_element = $("#addAvailButton");
    } else if (nvrgtr_data.assigned_added == 'chosen') {
      button_element = $("#addChosenButton");
    } else if (nvrgtr_data.assigned_added == 'ignored') {
      button_element = $("#addIgnoredButton");
    }
    button_element.removeClass('var-assigned-added');
    button_element.attr('title', button_element.data('add_desc'));
  }
  nvrgtr_data.assigned_added = '';
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
function setNormalizationMethod() {
  var norm = getNormalizationSettings();
  $.ajax({
    url: daemonURL('/set-normalization-method'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'normalization':norm}),
    error: function(error) { processError(error, "Error setting the normalization method"); }
  });
}
function calculateGlobalNormalization(max_var_dist) {
  // This should be called for every run, no matter if the user has selected global norm or not.
  var bins = calculateHistoTicks(max_var_dist);
  $.ajax({
    url: daemonURL('/calculate-global-normalization'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'var_nums':nvrgtr_data.result_links.var_nums, 'max_var_dist':max_var_dist, 'global_bins':bins, 'cur_var':null}),
    success: function(data_obj) {
      //var data = $.parseJSON(data_obj);
    },
    error: function(error) { processError(error, "Error calculating global normalization values"); }
  });
}

// =====  Data parsing / validation:
function validateFindVariantsCall() {
  if (!nvrgtr_data.tree_data) {
    return false;
  }
  if (nvrgtr_data.available.length + nvrgtr_data.chosen.length < 2) {
    showErrorPopup("You must select 2 or more variants from your tree and assign them as 'available' or 'chosen' before NaVARgator can perform clustering.");
    return false;
  }
  if (!( validateSpinner($("#numVarSpinner"), "Variants to find") &&
    validateSpinner($("#rangeSpinner"), "Range of variants") )) {
    return false;
  }
  var num_vars = parseInt($("#numVarSpinner").spinner('value')), num_vars_range = num_vars;
  if ($("#multipleRunCheckbox").is(':checked')) {
    num_vars_range = parseInt($("#rangeSpinner").spinner('value'));
    if (num_vars_range < num_vars) {
      showErrorPopup("The 'Variants to find' values be entered from low to high.");
      return false;
    }
  }
  var num_vars_int = parseInt(num_vars), num_vars_range_int = parseInt(num_vars_range),
    do_find_vars = false;
  for (var i=num_vars_int; i<=num_vars_range_int; ++i) {
    if (!nvrgtr_data.result_links.hasOwnProperty(i)) {
      do_find_vars = true;
    }
  }
  if (do_find_vars == false) {
    return false;
  }
  return {'num_vars':num_vars, 'num_vars_range':num_vars_range};
}
function getNormalizationSettings() {
  var ret = {'method':null, 'value':null};
  if ($("#normSelfRadio").is(':checked')) {
    ret.method = 'self';
  } else if ($("#normGlobalRadio").is(':checked')) {
    ret.method = 'global';
  } else if ($("#normValRadio").is(':checked')) {
    ret.method = 'custom';
    ret.value = parseFloat($("#normValInput").val());
  } else {
    showErrorPopup("Error: could not retrieve normalization settings from the page.");
  }
  return ret;
}
