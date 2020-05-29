// core.js then core_tree_functions.js are loaded before this file.

// BUGS:
// If truncate-tree-names is called with a too-short length, the page crashes. Want the error displayed, but not for the page to change
// If Normalize across runs is set, and you find variants, it crashes the result page. But only the first time; if you click the result link later it works fine.
// - Tracked it down to get_cluster_results() in navargator_daemon.py.
// - The normalization method is set before it actually happens, so
// - Ends up setting (nvrgtr_data.normalized_max_distance & data.normalization.value) to null in results.js:parseClusteredData(data), which causes the graph problems

// TODO:
// - For test_tree_4173 (and still noticable on 1399), clearing or adding to 'available' takes a surprisingly long time. Check if it can be optimized.
// - Would be nice to have a "hidden" js function that returns the connection_manager dict, so I can see on the web version how it's handling things (does "close" get sent on a reload?), and check into it from time to time.
//   - Wouldn't really be able to provide any functionality, as it would be potentially usable by anyone that cared to check the source code.
// - Would be great to also have export functions that produce files that can be read by TreeView (very popular software), or cytoscape. The files would be the tree, with nodes coloured or grouped together in some visual manner. Might have to get tricky with cytoscape; though I believe there is a "hierarchial" layout option that i could use.
// - When designing the threshold input window/frame:
//   - Should import an excel or csv/tsv file. Columns are the antigen, rows are the variants tested against.
//   - It's also common to have populations; ie antigen A from mouse 1, mouse 2; antigen B from mouse 1, mouse 2, etc. So allow user to select several columns and assign one variant name (from list, or auto-completing input).
//   - Common that a variant will have a different name in the tree, and in the reactivity data. Let user upload a "translation file". Format is pretty loose; name (comma,slash,space,tab,dash) name. File may contain many more names than are present in the data or tree.
// - It would be great if users could click/hover on a tree internal node and have all descendent nodes respond.
//   - The Tree.get_ordered_nodes() method from phylo.py can help. If leaves are in that order, then all internal nodes only need to know the indices of their descendents in that list.
//   - Not too sure how to get those node names here into js, and parse the tree to find the coordinates to draw a node object.
//   - If I do manage this, I'd like to add an option in Tree manipulations to save a subtree. Select all
// - The control elements are hiding internal borders between neighbouring buttons, and the toggle buttons do not. Neither is great. The toggle borders are too thick (they're doubled up), and the control elements only highlight on 3 sides (except some).
//   - I think the best solution is to use an outline for the shared borders (as they don't take up space), and change the z-index of the button on hover (so all 4 sides are visible) in addition to darkening the colour.
// - Should be a button to clear the results pane. Should also clear vf.normalize, but not wipe the cache. This will allow the user to specify what graph is shown and the global normalization, without requiring the clustering to be re-done. Especially important once nvrgtr files actually save clustering results too.
// - The header needs some finishing design work. I'd like to incorporate more green, but should wait for the icon to be finished first.
// - I quite like how the toggle button came out. Use that to style my buttons instead of relying on jqueryui.
// - I love the simple animations on hover. Would be great if I find a use for them (from the answer of https://stackoverflow.com/questions/30681684/animated-toggle-button-for-mobile)

//NOTE:
// - If the underlying vf is replaced, have to call setNormalizationMethod() to inform the new vf of the user's choice.
//   - This info is not retained when the new vf is created. I believe the only current points are on loading a new file (either from the button or the automatic load at the start), and when finding variants if any of the assigned variants have changed. Those are all currently covered.
//   - NEED TO CHECK THIS. After adding the re-ordering and rooting functions, make sure there's nothing more to do with them.

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
  initializeHelpButtons();
  initializeFloatingPanes();

  nvrgtr_page.session_id = location.search.slice(1);
  nvrgtr_page.browser_id = generateBrowserId(10);
  console.log('sessionID:'+nvrgtr_page.session_id+', browserID:'+nvrgtr_page.browser_id);

  // These calls can occasionally incorrectly return 0 from a race condition. This is checked in updateScoreGraph()
  nvrgtr_settings.graph.total_width = $("#scoreGraphSvg").width();
  nvrgtr_settings.graph.total_height = $("#scoreGraphSvg").height();

  setupTreeElements();
  setupDisplayOptionsPane();
  setupSelectionGroupsPane();
  setupNormalizationPane();
  setupRunOptions();
  setupResultsPane();
  setupVariantSelection();
  setupUploadSaveButtons();
  setupManipulationsPane();
  setupThresholdPane();

  $("#sessionIncludeDistancesCheckbox").prop('disabled', true);

  if (nvrgtr_page.session_id != '') {
    // The instance is from the local version of NaVARgator
    if (nvrgtr_page.session_id != 'local_input_page') {
      $("#introMessageGroup").remove();
      treeIsLoading(); // A tree is being automatically loaded
    }
    $.ajax({
      url: daemonURL('/get-basic-data'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify(getPageBasicData()),
      success: function(data_obj) {
        var num_vars = $.parseJSON(data_obj).leaves.length;
        calcSpecificDefaultDisplayOpts(num_vars);
        if (!newTreeLoaded(data_obj)) {  // If no session file loaded:
          $("#loadInputHeader").click(); //   open collapsible pane
          // Display options are set to default by parseBasicData()
        }
      },
      error: function(error) { processError(error, "Error loading input data from the server"); }
    });
  } else { // The instance is from the online version of NaVARgator
    processDisplayOptions(nvrgtr_default_display_opts); // Sets display options to default
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
      var filename = file_obj.name, suffix = parseFileSuffix(filename);
      if (suffix == 'nvrgtr') {
        upload_type_select.val('nvrgtr');
      } else {
        upload_type_select.val('auto');
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
    var selected_file_type = upload_type_select.val();
    form_data.append('session_id', nvrgtr_page.session_id);
    form_data.append('browser_id', nvrgtr_page.browser_id);
    form_data.append('tree_format', selected_file_type);
    form_data.append('file_name', file_obj.name);
    $("#introMessageGroup").remove();
    treeIsLoading();
    $.ajax({
      type: 'POST',
      url: daemonURL('/upload-tree-file'),
      contentType: false, // Not using contentType: "application/json" here,
      data: form_data, //    or JSON.stringify here, as it's sending files.
      cache: false,
      processData: false,
      success: function(data_obj) {
        var num_vars = $.parseJSON(data_obj).leaves.length;
        calcSpecificDefaultDisplayOpts(num_vars);
        newTreeLoaded(data_obj);
      },
      error: function(error) {
        processError(error, "Error uploading the input file");
      }
    });
  });
  save_button.click(function() {
    var inc_dists = $("#sessionIncludeDistancesCheckbox").is(':checked');
    $.ajax({
      url: daemonURL('/save-nvrgtr-file'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageAssignedData(), 'include_distances':inc_dists}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        if (nvrgtr_page.session_id != data.session_id) {
          changeSessionID(data.session_id);
        }
        if (data.saved_locally == true) {
          console.log('NaVARgator file saved locally');
        } else {
          var filename = data.filename;
          saveDataString(data.nvrgtr_as_string, filename, 'text/plain');
        }
      },
      error: function(error) { processError(error, "Error saving session file"); }
    });
  });
}
function setupManipulationsPane() {
  $(".tree-manipulation-buttons").button('disable'); // Enabled in newTreeLoaded()
  $("#rootMidpointButton").click(function() {
    rerootTree('midpoint');
  });
  $("#rootSelectionButton").click(function() {
    rerootTree('outgroup');
  });
  $("#reorderNodesButton").attr("increasing", "true"); // Sets order direction
  $("#reorderNodesButton").click(function() {
    treeIsLoading();
    var order_dir = $("#reorderNodesButton").attr("increasing");
    $.ajax({
      url: daemonURL('/reorder-tree-nodes'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageAssignedData(), 'increasing':order_dir}),
      success: function(data_obj) {
        newTreeLoaded(data_obj);
      },
      error: function(error) { processError(error, "Error re-ordering the tree nodes"); }
    });
    $("#reorderNodesButton").attr("increasing", function(index, attr) {
      return attr == "true" ? "false" : "true";
    }); // Toggles the attribute.
  });
  var trunc_name_min = 1;
  $("#truncateNamesSpinner").spinner({
    min: trunc_name_min, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 15);
  $("#truncateNamesSpinner").attr("last_good_value", 0); // Used to store successful values.
  $("#truncateNamesButton").click(function() {
    var last_good = null;
    var trunc_length = $("#truncateNamesSpinner").spinner('value');
    if (trunc_length == null || trunc_length < trunc_name_min) {
      showErrorPopup("Error: the truncation length for tree names must be a number >= "+trunc_name_min);
      return false;
    }
    treeIsLoading();
    //data: JSON.stringify({'session_id':nvrgtr_page.session_id, 'browser_id':nvrgtr_page.browser_id, 'chosen':nvrgtr_data.chosen, 'available':nvrgtr_data.available, 'ignored':nvrgtr_data.ignored, 'display_opts':nvrgtr_display_opts, 'selection_groups_order':[...nvrgtr_data.selection_groups.keys()],  'selection_groups_data':Object.fromEntries(nvrgtr_data.selection_groups), 'truncate_length':trunc_length}),
    $.ajax({
      url: daemonURL('/truncate-tree-names'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageAssignedData(), 'truncate_length':trunc_length}),
      success: function(data_obj) {
        newTreeLoaded(data_obj);
        $("#truncateNamesSpinner").attr("last_good_value", trunc_length);
      },
      error: function(error) {
        $("#truncateNamesSpinner").spinner('value', $("#truncateNamesSpinner").attr("last_good_value"));
        $("#treeLoadingMessageGroup").hide();
        processError(error, "Error truncating the tree names");
      }
    });
  });
  $("#saveTreeButton").click(function() {
    var tree_type = $("#saveTreeTypeSelect").val();
    $.ajax({
      url: daemonURL('/save-tree-file'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageAssignedData(), 'tree_type':tree_type}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        if (nvrgtr_page.session_id != data.session_id) {
          changeSessionID(data.session_id);
        }
        if (data.saved_locally == true) {
          console.log('Tree file saved locally');
        } else {
          var filename = data.filename;
          saveDataString(data.tree_string, filename, 'text/plain');
        }
      },
      error: function(error) { processError(error, "Error saving tree file"); }
    });
  });
  $("#saveTreeImageButton").click(function() {
    var svg_data = $("#figureSvg")[0].outerHTML; // This won't work in IE, but neither does the rest of navargator
    downloadData("navargator_tree.svg", svg_data, "image/svg+xml;charset=utf-8");
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
    custom_input.val(val);
    if (val == custom_input.data('prev_val') || !custom_go_button.is(':active') && !custom_radio.is(':checked')) {
      hideGoButton();
    }
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
    min: 1, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 1);
  $("#rangeSpinner").spinner({
    min: 1, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 2);
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
  //$("#clustMethodSelect").selectmenu();
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
      data: JSON.stringify({...getPageAssignedData(), 'cluster_method':cluster_method, 'num_vars':num_vars, 'num_vars_range':num_vars_range}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        if (nvrgtr_page.session_id != data.session_id) {
          changeSessionID(data.session_id);
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
  $("#findVariantsButton").button('disable');
}
function setupResultsPane() {
  setupScoresGraph();
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
    var added_key = (nvrgtr_data.assigned_added == 'available') ? '' : 'available';
    if (added_key != '') { /* Add selected to assigned.*/
      nvrgtr_data.available.push(...nvrgtr_data.selected);
      nvrgtr_data.available = [...new Set(nvrgtr_data.available)];
      nvrgtr_data.chosen = $.grep(nvrgtr_data.chosen, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
      nvrgtr_data.ignored = $.grep(nvrgtr_data.ignored, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
    } else { /* Remove selected from assigned.*/
      nvrgtr_data.available = $.grep(nvrgtr_data.available, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
    }
    addAssignedButtonHandler(event, add_avail_button, added_key);
  });
  add_chosen_button.click(function(event) {
    var added_key = (nvrgtr_data.assigned_added == 'chosen') ? '' : 'chosen';
    if (added_key != '') { /* Add selected to assigned.*/
      nvrgtr_data.chosen.push(...nvrgtr_data.selected);
      nvrgtr_data.chosen = [...new Set(nvrgtr_data.chosen)];
      nvrgtr_data.available = $.grep(nvrgtr_data.available, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
      nvrgtr_data.ignored = $.grep(nvrgtr_data.ignored, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
    } else { /* Remove selected from assigned.*/
      nvrgtr_data.chosen = $.grep(nvrgtr_data.chosen, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
    }
    addAssignedButtonHandler(event, add_chosen_button, added_key);
  });
  add_ignored_button.click(function(event) {
    var added_key = (nvrgtr_data.assigned_added == 'ignored') ? '' : 'ignored';
    if (added_key != '') { /* Add selected to assigned.*/
      nvrgtr_data.ignored.push(...nvrgtr_data.selected);
      nvrgtr_data.ignored = [...new Set(nvrgtr_data.ignored)];
      nvrgtr_data.chosen = $.grep(nvrgtr_data.chosen, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
      nvrgtr_data.available = $.grep(nvrgtr_data.available, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
    } else { /* Remove selected from assigned.*/
      nvrgtr_data.ignored = $.grep(nvrgtr_data.ignored, function(n, i) { return !(nvrgtr_data.selected.has(n)) });
    }
    addAssignedButtonHandler(event, add_ignored_button, added_key);
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
  setTimeout(setupPage, 10);
});
$(window).bind('beforeunload', function() {
  // Lets the background server know this instance has been closed.
  closeInstance();
});

// =====  Page udating:
function calcSpecificDefaultDisplayOpts(num_vars) {
  // Calculates new default values for certain options that are tree-specific. These will be overwritten by any loaded session values. Other display options will be taken from their current values on the page.
  nvrgtr_display_opts.sizes.scale_bar_distance = 0.0; // Resets the scale bar distance, so a default value will be calculated
  if (num_vars == 0) {
    return; // Happens for local version of the input page with no tree pre-loaded
  }
  if (num_vars <= 150) {
    nvrgtr_default_display_opts.fonts.tree_font_size = 13;
    nvrgtr_default_display_opts.sizes.small_marker_radius = 2;
    nvrgtr_default_display_opts.sizes.big_marker_radius = 3;
    nvrgtr_display_opts.fonts.tree_font_size = 13;
    nvrgtr_display_opts.sizes.small_marker_radius = 2;
    nvrgtr_display_opts.sizes.big_marker_radius = 3;
  } else if (num_vars > 150 && num_vars <= 250) {
    nvrgtr_default_display_opts.fonts.tree_font_size = 8;
    nvrgtr_default_display_opts.sizes.small_marker_radius = 1.5;
    nvrgtr_default_display_opts.sizes.big_marker_radius = 2.5;
    nvrgtr_display_opts.fonts.tree_font_size = 8;
    nvrgtr_display_opts.sizes.small_marker_radius = 1.5;
    nvrgtr_display_opts.sizes.big_marker_radius = 2.5;
  } else if (num_vars > 250) {
    nvrgtr_default_display_opts.fonts.tree_font_size = 0;
    nvrgtr_default_display_opts.sizes.small_marker_radius = 1;
    nvrgtr_default_display_opts.sizes.big_marker_radius = 2;
    nvrgtr_display_opts.fonts.tree_font_size = 0;
    nvrgtr_display_opts.sizes.small_marker_radius = 1;
    nvrgtr_display_opts.sizes.big_marker_radius = 2;
  }
  if (num_vars > 400) {
    nvrgtr_default_display_opts.sizes.small_marker_radius = 0.5;
    nvrgtr_default_display_opts.sizes.big_marker_radius = 1;
    nvrgtr_display_opts.sizes.small_marker_radius = 0.5;
    nvrgtr_display_opts.sizes.big_marker_radius = 1;
  }
  if (num_vars > 1400) {
    nvrgtr_default_display_opts.sizes.big_marker_radius = 0.5;
    nvrgtr_display_opts.sizes.big_marker_radius = 0.5;
  }
}
function newTreeLoaded(data_obj) {
  // Returns true if a tree was loaded, false otherwise.
  $("#clearSelectionButton").click();
  parseBasicData(data_obj);
  clearInterval(nvrgtr_page.maintain_interval_obj);
  nvrgtr_page.maintain_interval_obj = setInterval(maintainServer, nvrgtr_page.maintain_interval);
  if (nvrgtr_data.tree_data) {
    setNormalizationMethod();
    $("#treeSelectionDiv").show();
    $("#treeControlsDiv").show();
    $("#treeLegendLeftGroup").show();
    $("#treeScaleBarGroup").show();
    $("#currentTreeFile").html(nvrgtr_data.file_name);
    redrawTree(); // May take a long time for large trees
    $("#uploadFileInput").val('');
    $("#saveSessionButton").button('enable');
    $("#uploadFileButton").button('disable');
    $(".tree-manipulation-buttons").button('enable');
    $("#truncateNamesSpinner").spinner('value', nvrgtr_display_opts.sizes.max_variant_name_length);
    $("#showLegendCheckbox").prop('disabled', false);
    $("#showScaleBarCheckbox").prop('disabled', false);
    $("#sessionIncludeDistancesCheckbox").prop('disabled', false);
    $("#redrawTreeButton").button('enable');
    $("#findVariantsButton").button('enable');
    clearHideResultsPane();
    return true;
  } else {
    return false;
  }
}
function redrawTree() {
  drawTree();
  updateVarSelectList();
  updateRunOptions();
  applyAllSelectionGroupFormats();
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
  // Updates the max on the number of variants spinner, and the labels of the choose available and ignored variant buttons. Should be called every time the assigned variants are modified.
  var maxVars = Math.max(nvrgtr_data.chosen.length + nvrgtr_data.available.length, 1);
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
    result_link_obj = $('<a class="result-link" href="'+results_url+'" title="'+result_description+'" target="_blank">'+result_description+' [processing...]</a>');
    result_list_obj = result_link_obj.wrap('<li class="result-link-li">').parent();
    result_list_obj.attr("variantNumber", var_num);
    links_list.append(result_list_obj);
    nvrgtr_data.result_links[var_num] = {'url':results_url, 'link':result_link_obj, 'score':null};
    nvrgtr_data.result_links.var_nums.push(var_num);
    // Update the display options just-in-time before a results page is opened.
    result_link_obj.click(function() {
      $.ajax({
        url: daemonURL('/update-visual-options'),
        type: 'POST',
        contentType: "application/json",
        data: JSON.stringify(getPageVisualData()),
        error: function(error) { processError(error, "Error updating display options"); }
      });
    });
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
    data: JSON.stringify({...getPageBasicData(), 'var_nums':nvrgtr_data.result_links.var_nums}),
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
  if (nvrgtr_settings.graph.total_width == 0) {
    nvrgtr_settings.graph.total_width = $("#scoreGraphSvg").width();
    nvrgtr_settings.graph.total_height = $("#scoreGraphSvg").height();
    console.log('reseting graph dims', $("#scoreGraphSvg").width(), $("#scoreGraphSvg").height());
    nvrgtr_data.graph.g.remove();
    setupScoresGraph();
  }

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
function rerootTree(method) {
  treeIsLoading();
  $.ajax({
    url: daemonURL('/reroot-tree'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify({...getPageAssignedData(), 'root_method':method, 'selected':[...nvrgtr_data.selected]}),
    success: function(data_obj) {
      newTreeLoaded(data_obj);
    },
    error: function(error) { processError(error, "Error rooting the tree"); }
  });
}
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
function addAssignedButtonHandler(event, button_element, assigned_key) {
  event.stopPropagation();
  if (nvrgtr_data.selected.size == 0) { return false; }
  nvrgtr_data.selected.forEach(function(var_name) {
    if (assigned_key != '') {
      nodeLabelMouseoverHandler(var_name);
    } else {
      nodeLabelMouseoutHandler(var_name);
    }
  });
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
  if (nvrgtr_data.num_selected == 0) {
    $("#selectionGroupText").html('Selection');
  } else {
    $("#selectionGroupText").html('<b>'+nvrgtr_data.num_selected+'</b> selected');
  }
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
    data: JSON.stringify({...getPageBasicData(), 'normalization':norm}),
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
    data: JSON.stringify({...getPageBasicData(), 'var_nums':nvrgtr_data.result_links.var_nums, 'max_var_dist':max_var_dist, 'global_bins':bins, 'cur_var':null}),
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
  var num_avail = nvrgtr_data.available.length, num_chosen = nvrgtr_data.chosen.length;
  if (num_avail + num_chosen < 1) {
    showErrorPopup("You must select 1 or more variants from your tree and assign them as 'available' or 'chosen' before NaVARgator can perform clustering.");
    return false;
  }
  if (!( validateSpinner($("#numVarSpinner"), "Variants to find") &&
    validateSpinner($("#rangeSpinner"), "The range of variants to find") )) {
    return false;
  }
  var num_vars = parseInt($("#numVarSpinner").spinner('value')), num_vars_range = num_vars;
  if ($("#multipleRunCheckbox").is(':checked')) {
    num_vars_range = parseInt($("#rangeSpinner").spinner('value'));
    if (num_vars_range < num_vars) {
      let temp = num_vars;
      num_vars = num_vars_range;
      num_vars_range = temp;
      $("#numVarSpinner").spinner('value', num_vars);
      $("#rangeSpinner").spinner('value', num_vars_range);
    }
  }
  if (num_vars < num_chosen || num_vars_range > num_chosen + num_avail) {
    showErrorPopup("The variants to find must be greater than or equal to the number of 'chosen', but less than or equal to the number of 'chosen' + 'available'.");
    return false;
  }
  var do_find_vars = false;
  for (var i=num_vars; i<=num_vars_range; ++i) {
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
// =====  Misc methods:
function setupSpecificHelpButtonText() {
  // Common elements' help messages defined in core.js:setupCoreHelpButtonText()
  // Tree options help:
  //$("#treeOptsHelp .help-text-div").css('width', '500px');
  $("#treeOptsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
  // Distance threshold help:
  $("#distanceThreshHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
  // Assigned variants help:
  $("#assignedVarsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
}
