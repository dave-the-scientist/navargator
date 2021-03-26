// core.js then core_tree_functions.js are loaded before this file.

// BUGS:


// TODO:
// - Make sure the result links can handle new runs with a more stringent algorithm. Would be good to add the method to the tooltip at least.
// - Finish checkIfProcessingDone(). Add num clusters to thresh results, add a new hidable "Errors" section to add those links to instead of keeping them in the "Results page" section. Also add a "Replaced" or something section, to store runs that have been replaced by more stringent calls. IE the greedy results are replaced by optimal.
// - Upon loading a tree, the default threshold algorithms should be updated (pick greedy for big trees, minimal with max cycles for medium, unrestricted optimal for smaller trees).
// - Once nvrgtr files store cluster results, have the page load and display the last-used clustering method and params (including num_replicates, tolerance, etc).
// - Don't love the current result link format. Maybe "K=3 @T.0 [score]" & "C=3 @90%Th.0 [score]" or something? "[3] K@T.0 (score)" & "[3] 90%@Th.0 (score)"? When I have threshold clustering running try some different formats out. Also finish the bit in checkIfProcessingDone()
//   - Better idea. Use "R1, R2, ..." for graph x-axis. Then in the Results pages section, can expand the parameters of that run: "R1 - [3] 100% within 0.02 (11.4213)". Re-order as necesary, so R1 is always the worst-scoring. If just one result, don't use the "R1 -" notation.
//   - Though I want previously-visited links to indicate that; makes navigating new results easier.

// - Should be a button to clear the results pane. Should also clear vf.normalize, but not wipe the cache. This will allow the user to specify what graph is shown and the global normalization, without requiring the clustering to be re-done. Especially important once nvrgtr files actually save clustering results too.
// - Profile (in chrome) opening a large tree. Can the loading/drawing be sped up?
//   - Majority of time being taken by recursiveCalculateNodePositions() in libs/jsphylosvg-DC.js
//   - I believe a big issue is that when a tree is drawn, a ton of getBBox() calls are being made in the recursive fxn. Can these be avoided?
//   - Could potentially be improved by managing reflow/layout thrashing (too many little DOM modifications, replace with a single big one). Discussed at https://developers.google.com/web/fundamentals/performance/rendering/avoid-large-complex-layouts-and-layout-thrashing and at https://gist.github.com/paulirish/5d52fb081b3570c81e3a, also includes a suggestion to use the FASTDOM lib https://github.com/wilsonpage/fastdom
//   - Might be possible to build a big pathstring of the tree, then draw it once at the end. Instead of drawing each line segment one at a time. Not as a string though; as an array of arrays of strings to avoid Raphael's text parsing which is somewhat slow
//   - Some other tips here https://inductive-kickback.com/2015/03/squeezing-the-most-out-of-raphael-js-for-svg-generation/
// - When starting a run, the underlying vf doesn't start clustering until the tree has been drawn on the results page. At least it doesn't seem to be. Why is that? See if I can fix that.
// - When designing the threshold input window/frame:
//   - Should import an excel or csv/tsv file. Columns are the antigen, rows are the variants tested against.
//   - It's also common to have populations; ie antigen A from mouse 1, mouse 2; antigen B from mouse 1, mouse 2, etc. So allow user to select several columns and assign one variant name (from list, or auto-completing input).
//   - Common that a variant will have a different name in the tree, and in the reactivity data. Let user upload a "translation file". Format is pretty loose; name (comma,slash,space,tab,dash) name. File may contain many more names than are present in the data or tree.
// - The control elements are hiding internal borders between neighbouring buttons, and the toggle buttons do not. Neither is great. The toggle borders are too thick (they're doubled up), and the control elements only highlight on 3 sides (except some).
//   - I think the best solution is to use an outline for the shared borders (as they don't take up space), and change the z-index of the button on hover (so all 4 sides are visible) in addition to darkening the colour.
// - Resize the page logo image file to whatever size I decide on.
// - I quite like how the toggle button came out. Use that to style my buttons instead of relying on jqueryui.
// - I love the simple animations on hover. Would be great if I find a use for them (from the answer of https://stackoverflow.com/questions/30681684/animated-toggle-button-for-mobile)

//NOTE:
// - For the Run Options help section:
//   - It takes ~2 minutes to load a tree of 4173 variants in Chrome. Identifying 3 clusters only took ~10 seconds per replication using minibatch, vs ~70 seconds with k medoids.
//   - When identifying 5 clusters, it took ~15 seconds per replication using minibatch compared to 112 sec per replication with k medoids.
//   - Brute force
//     - Tree=59: k=2 0.07s, k=3 1.3s, k=4 20.8s, k=5 248s
//     - Tree=82: k=2 0.15s, k=3 4.4s, k=4 91.5s, k=5 1753s
//     - Tree=275: k=2 4.6s, k=3 383s
//     - Tree=487: k=2 22s, k=3 3634s
//   - Medoids @ 10 reps:
//     - Tree=59: k=2 0.10s, k=3 0.19s, k=4 0.22s, k=5 0.29s
//     - Tree=82: k=2 0.17s, k=3 0.31s, k=4 0.45s, k=5 0.60s
//     - Tree=275: k=2 1.5s, k=3 2.9s, k=4 3.5s, k=5 3.8s
//     - Tree=487: k=2 3.6s, k=3 5.5s, k=4 11.9s, k=5 15.2s
//     - Tree=1399: k=2 29s, k=3 45s, k=4 74s, k=5 105s
//     - Tree=4173: k=2 263s, k=3 428s, k=4 595s, k=5 770s
//   - Minibatch @ 5 reps / 5000 batch:
//     - Tree=59: k=2 0.05s, k=3 0.08s, k=4 0.12s, k=5 0.15s
//     - Tree=82: k=2 0.09s, k=3 0.17s, k=4 0.26s, k=5 0.30s
//     - Tree=275: k=2 0.67s, k=3 1.5s, k=4 1.9s, k=5 2.7s
//     - Tree=487: k=2 1.7s, k=3 2.6s, k=4 5.6s, k=5 8.2s
//     - Tree=1399: k=2 7s, k=3 14s, k=4 19s, k=5 25s
//     - Tree=4173: k=2 34s, k=3 37s, k=4 63s, k=5 88s
// - For FAQs or something:
//   - If threshold is used to identify 4 clusters, that result will always have a worse Tree score than if a k- method was used. This is a consequences of threshold optimizing a different function, while k- all optimize the Tree score directly. (ensure this is actually true in practice)

// - If the underlying vf is replaced, have to call setNormalizationMethod() to inform the new vf of the user's choice.
//   - This info is not retained when the new vf is created. I believe the only current points are on loading a new file (either from the button or the automatic load at the start), and when finding variants if any of the assigned variants have changed. Those are all currently covered.
//   - NEED TO CHECK THIS. After adding the re-ordering and rooting functions, make sure there's nothing more to do with them.

// =====  Modified common variables:
$.extend(nvrgtr_page, {
  'page':'input', 'check_results_timer':null, 'check_results_interval':500
});
$.extend(nvrgtr_data, {
  'result_links':{'run_ids':[], 'run_descripts':[], 'scores':[]}, 'assigned_selected':'', 'assigned_added':'', 'threshold':null,
  'thresh':{
    'g':null, 'x_fxn':null, 'y_fxn':null, 'line_fxn':null, 'sigmoid_fxn':null, 'sigmoid_inv':null, 'sigmoid_data':null, 'line_graph':null, 'indicator':null, 'indicator_line_v':null, 'indicator_line_h':null, 'x_axis':null, 'y_axis':null, 'params':null, 'data':null
  },
  'graph':{
    'g':null, 'x_fxn':null, 'y_fxn':null, 'line_fxn':null, 'x_axis':null, 'y_axis':null
  }
});
$.extend(nvrgtr_settings, {
  'thresh':{
    'width':null, 'height':null, 'label_font':'Helvetica, Arial, sans-serif', 'label_font_size':'14px', 'scatter_stroke_width':'1px', 'scatter_stroke':'#555555', 'scatter_fill':'#EAFEEC', 'scatter_radius':2.5, 'line_stroke_width':'2px', 'line_stroke':null,
    'margin':{
      'top':10, 'right':15, 'bottom':44, 'left':40
    }
  }
});
$.extend(nvrgtr_settings.graph, {
  'margin':{top:7, right:32, bottom:45, left:37}
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
  setupExportPane();
  setupNormalizationPane();
  setupClusteringOptions();
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
        treeHasLoaded();
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
      error: function(error) {
        treeHasLoaded();
        processError(error, "Error re-ordering the tree nodes");
      }
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
  $("#truncateNamesSpinner").attr("last_good_value", 15); // Used to store successful values.
  $("#truncateNamesButton").click(function() {
    var last_good = null;
    var trunc_length = $("#truncateNamesSpinner").spinner('value');
    if (trunc_length == null || trunc_length < trunc_name_min) {
      showErrorPopup("Error: the truncation length for tree names must be a number >= "+trunc_name_min);
      return false;
    }
    treeIsLoading();
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
        treeHasLoaded();
        processError(error, "Truncation too short");
      }
    });
  });
}
function setupExportPane() {
  var export_pane = $("#exportNamesPane"), export_text = $("#exportNamesText");
  export_pane.data('names', []); // Stores the names, to be manipulated by the pane.
  function formatDisplayExportNames() {
    // Function to format the information based on the user's selection.
    var delimiter, delimiter_type = $("#exportDelimiterSelect").val();
    if (delimiter_type == 'tab') {
      delimiter = '\t';
    } else if (delimiter_type == 'comma') {
      delimiter = ', ';
    } else if (delimiter_type == 'space') {
      delimiter = ' ';
    } else if (delimiter_type == 'newline') {
      delimiter = '\n';
    }
    var names = export_pane.data('names'),
      new_text_val = names.join(delimiter);
    export_text.val(new_text_val);
    export_text.css('height', ''); // Need to unset before setting, otherwise it cannot shrink.
    export_text.css('height', export_text[0].scrollHeight+'px');
    showFloatingPane(export_pane);
  }
  // Button callbacks:
  $("#exportTreeFileButton").click(function() {
    let tree_type = $("#exportTreeFileTypeSelect").val();
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
          saveDataString(data.tree_string, data.filename, 'text/plain');
        }
      },
      error: function(error) { processError(error, "Error saving tree file"); }
    });
  });
  $("#exportSubtreeFileButton").click(function() {
    let tree_type = $("#exportSubtreeFileTypeSelect").val(),
      selected_vars = [...nvrgtr_data.selected];
    if (selected_vars.length < 2){
      showErrorPopup("Error: you must select 2 or more variants to define the subtree to save.");
      return;
    }
    $.ajax({
      url: daemonURL('/save-subtree-file'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageAssignedData(), 'tree_type':tree_type, 'selected_vars':selected_vars}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        if (nvrgtr_page.session_id != data.session_id) {
          changeSessionID(data.session_id);
        }
        if (data.saved_locally == true) {
          console.log('Tree file saved locally');
        } else {
          saveDataString(data.tree_string, data.filename, 'text/plain');
        }
      },
      error: function(error) { processError(error, "Error saving tree file"); }
    });
  });
  $("#exportTreeImageButton").click(function() {
    //var svg_data = $("#figureSvg")[0].outerHTML; // This won't work in IE, but neither does the rest of navargator
    //downloadData("navargator_tree.svg", svg_data, "image/svg+xml;charset=utf-8");

    let svg_data = cleanSvg("#figureSvg");
    downloadData("navargator_tree.svg", svg_data, "image/svg+xml;charset=utf-8");
  });
  $("#exportSelectionButton").click(function() {
    // Sets 'names' to a list of the selected variants in selection order.
    export_pane.data('names', [...nvrgtr_data.selected]);
    formatDisplayExportNames();
  });
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
        $("#variantDistancesText").text(data.distances.join(', '));
        $("#variantDistancesText").css('height', ''); // Need to unset before setting, otherwise it cannot shrink.
        $("#variantDistancesText").css('height', $("#variantDistancesText")[0].scrollHeight+'px');
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

  // Functionality of the export pane:
  $("#exportNamesCheckbox, #exportNamesAndScoresCheckbox").change(function() {
    formatDisplayExportNames();
  });
  $("#exportDelimiterSelect").change(function() {
    formatDisplayExportNames();
  });
  $("#exportNamesCopyButton").click(function() {
    export_text.select();
    document.execCommand("copy");
  });
  $("#exportNamesSaveButton").click(function() {
    var text_data = export_text.val();
    downloadData('navargator_selection.txt', text_data, "text/plain");
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
function setupClusteringOptions() {
  // K-based methods setup
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
  $("#clustToleranceSpinner").spinner({
    min: 0, max: null,
    numberFormat: 'N1', step: 0.001
  }).spinner('value', 1);
  $("#clustRandStartsSpinner").spinner({
    min: 0, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 10);
  $("#clustBatchSizeSpinner").spinner({
    min: 0, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 500);
  $("#varRangeCheckbox").change(function() {
    if ($("#varRangeCheckbox").is(':checked')) {
      $(".variant-range-only").css('visibility', 'visible');
    } else {
      $(".variant-range-only").css('visibility', 'hidden');
    }
  });
  $("#rangeSpinner").parent().addClass('variant-range-only');
  $(".clust-method-batch-size").hide();
  $(".clust-method-thresh-ele").hide();
  // Threshold-based methods setup
  $("#threshPercentSpinner").spinner({
    min: 1, max: 100,
    numberFormat: 'N1', step: 0.1
  }).spinner('value', 100);
  $("#maxCyclesSpinner").spinner({
    min: 1, max: 1000000,
    numberFormat: 'N0', step: 1
  }).spinner('value', 50000);
  $("#capCyclesCheckbox").change(function() {
    if ($("#capCyclesCheckbox").is(':checked')) {
      $("#maxCyclesSpinner").prop('disabled', false);
    } else {
      $("#maxCyclesSpinner").prop('disabled', true);
    }
  });
  $("#maxCyclesSpinner").prop('disabled', true);

  // Button callbacks:
  $("#clustMethodNumberCheckbox, #clustMethodThresholdCheckbox").change(function() {
    if ($("#clustMethodNumberCheckbox").is(':checked')) {
      $(".clust-type-number-ele").show();
      $(".clust-method-thresh-ele").hide();
    } else {
      $(".clust-type-number-ele").hide();
      $(".clust-method-thresh-ele").show();
    }
  });
  $("#kClustMethodSelect").change(function(event) {
    if (event.target.value == 'brute force') {
      $(".clust-method-run-reps").hide();
      $(".clust-method-batch-size").hide();
    } else if (event.target.value == 'k medoids') {
      $("#clustRandStartsSpinner").spinner('value', 10);
      $(".clust-method-run-reps").show();
      $(".clust-method-batch-size").hide();
    } else if (event.target.value == 'k minibatch') {
      $("#clustRandStartsSpinner").spinner('value', 5);
      $(".clust-method-run-reps").show();
      $(".clust-method-batch-size").show();
    }
  });
  $("#threshClustMethodSelect").change(function(event) {
    if (event.target.value == 'qt minimal') {
      // When minimal selected
    } else if (event.target.value == 'qt greedy') {
      // When greedy selected
    }
  });

  $("#findVariantsButton").click(function() {
    var args = getValidateFindVariantsArgs();
    if (args == false) {
      return false;
    }
    var cluster_method;
    if ($("#clustMethodNumberCheckbox").is(':checked')) {
      cluster_method = $("#kClustMethodSelect").val();
    } else {
      cluster_method = $("#threshClustMethodSelect").val();
    }
    var auto_open = ($("#clustMethodNumberCheckbox").is(':checked') && !$("#varRangeCheckbox").is(':checked')),
      auto_result_page = null;
    if (auto_open == true) {
      // Have to open the page directly from the user's click to avoid popup blockers.
      auto_result_page = window.open('', '_blank');
    }
    $.ajax({
      url: daemonURL('/find-variants'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({...getPageAssignedData(), 'cluster_method':cluster_method, 'args':args}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        if (nvrgtr_page.session_id != data.session_id) {
          changeSessionID(data.session_id);
          setNormalizationMethod();
          clearHideResultsPane();
        }
        updateResultsLinksPane(data.run_ids, data.descriptions, data.tooltips);
        if (auto_open == true && auto_result_page != null) {
          auto_result_page.location.href = nvrgtr_data.result_links[data.run_ids[0]].url;
        }
      },
      error: function(error) { processError(error, "Server error in finding variants"); }
    });
  });
  $("#findVariantsButton").button('disable');
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
  // Floating pane element setup
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
      data: JSON.stringify({...getPageAssignedData(), 'data':data, 'max_val':max_val}),
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

function setupResultsPane() {
  setupScoresGraph();
}
function setupScoresGraph() {
  var total_width = nvrgtr_settings.graph.total_width,
    total_height = nvrgtr_settings.graph.total_height,
    margin = nvrgtr_settings.graph.margin,
    width = total_width - margin.left - margin.right,
    height = total_height - margin.top - margin.bottom;
  // Set up svg and g objects:
  var svg = d3.select("#scoreGraphSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  nvrgtr_data.graph.g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up graphing functions:
  nvrgtr_data.graph.x_fxn = d3.scalePoint()
    .range([0, width]);
  nvrgtr_data.graph.y_fxn = d3.scaleLinear()
    .range([height, 0]);
  nvrgtr_data.graph.line_fxn = d3.line()
    .x(function(d,i) { return nvrgtr_data.graph.x_fxn(nvrgtr_data.result_links.run_descripts[i]); })
    .y(function(d,i) { return nvrgtr_data.graph.y_fxn(d); });
  // Set up graph axes:
  nvrgtr_data.graph.x_axis = d3.axisBottom(nvrgtr_data.graph.x_fxn);
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
  /*nvrgtr_data.graph.g.append("text") // x axis label - NOT CURRENTLY BEING USED
    .attr("class", "score-axis-label x-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 30)
    .text("Number of clusters");*/
  nvrgtr_data.graph.g.append("text") // y axis
    .attr("class", "score-axis-label y-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", 0 - height/2)
    .attr("y", 12 - margin.left)
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
  if (num_vars > 500) {
    $("#kClustMethodSelect").val('k minibatch');
    $("#kClustMethodSelect").change();
  }
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
  treeHasLoaded();
  parseBasicData(data_obj);
  clearInterval(nvrgtr_page.maintain_interval_obj);
  nvrgtr_page.maintain_interval_obj = setInterval(maintainServer, nvrgtr_page.maintain_interval);
  if (nvrgtr_data.tree_data) {
    setNormalizationMethod();
    $("#treeSelectionDiv").show();
    $("#treeControlsDiv").show();
    $("#currentTreeFile").html(nvrgtr_data.file_name);
    redrawTree(); // May take a long time for large trees
    $("#uploadFileInput").val('');
    $("#saveSessionButton").button('enable');
    $("#uploadFileButton").button('disable');
    $(".tree-manipulation-buttons").button('enable');
    $("#truncateNamesSpinner").spinner('value', nvrgtr_display_opts.sizes.max_variant_name_length);
    $("#truncateNamesSpinner").attr("last_good_value", nvrgtr_display_opts.sizes.max_variant_name_length);
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
  clearTree();
  drawTree();
  updateVarSelectList();
  updateClusteringOptions();
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
  $('#varSelectDiv > .var-select-label').css({'color': nvrgtr_display_opts.colours.label_text, 'background': nvrgtr_display_opts.colours.label_bg});
  $("#chosenAssignedDiv").css('border-color', nvrgtr_display_opts.colours.chosen);
  $("#availAssignedDiv").css('border-color', nvrgtr_display_opts.colours.available);
  $("#ignoredAssignedDiv").css('border-color', nvrgtr_display_opts.colours.ignored);
  $("#numVariantsSpan").html(nvrgtr_data.leaves.length);
  $("#mainVariantSelectDiv").show();
}
function updateClusteringOptions() {
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
    nvrgtr_data.nodes[var_name].variant_select_label.css('border-color', nvrgtr_display_opts.colours[colour_key]);
  }
}
function clearHideResultsPane() {
  nvrgtr_data.result_links = {'run_ids':[], 'run_descripts':[], 'scores':[]};
  $("#resultsLinksDiv").hide();
  $("#scoreGraphSvg").hide();
  $(".result-link-li").remove();
}
function updateResultsLinksPane(run_ids, descriptions, tooltips) {
  var run_id, results_url, result_link_obj, result_list_obj,
    links_list = $("#resultsLinksList");
  // Add links for the new runs into the results pane:
  for (let i=0; i<run_ids.length; ++i) {
    run_id = run_ids[i];
    if (nvrgtr_data.result_links.run_ids.includes(run_id)) {
      continue;
    }
    results_url = nvrgtr_page.server_url + '/results?' + nvrgtr_page.session_id + '_' + run_id;
    result_link_obj = $('<a class="result-link" href="'+results_url+'" title="'+tooltips[i]+'" target="_blank">'+descriptions[i]+' [processing...]</a>');
    result_list_obj = result_link_obj.wrap('<li class="result-link-li">').parent();
    links_list.append(result_list_obj);
    nvrgtr_data.result_links[run_id] = {'url':results_url, 'link':result_link_obj, 'description':descriptions[i], 'score':null};
    nvrgtr_data.result_links.run_ids.push(run_id);
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
    data: JSON.stringify({...getPageBasicData(), 'run_ids':nvrgtr_data.result_links.run_ids}),
    success: function(data_obj) {
      var data = $.parseJSON(data_obj);
      if (JSON.stringify(data.run_ids) != JSON.stringify(nvrgtr_data.result_links.run_ids)) {
        console.log('Aborting checkIfProcessingDone(), as the returned list does not match. Likely due to a race condition.');
        return false; // RACE CONDITION: Don't update anything, because the user has already re-run the analysis.
      }
      let score, run_id, desc, max_dist, cycles_used, error_msg,
        draw_graph = false, max_var_dist = 0;
      for (let i=0; i<data.scores.length; ++i) {
        score = data.scores[i];
        run_id = data.run_ids[i];
        if (score == false) { // Run has not yet ended
          cycles_used = data.num_clusts[i];
          console.log('cycles used: '+cycles_used);
        } else if (nvrgtr_data.result_links[run_id].score == null) { // Run ended but not yet processed
          if (score == 'error') {  // Run ended in error
            // Don't add to nvrgtr_data.result_links.run_descripts or .scores, which inform the score graph
            error_msg = data.num_clusts[i];
            nvrgtr_data.result_links[run_id].score = 'error';
            nvrgtr_data.result_links[run_id].link.attr('title', error_msg);
            desc = nvrgtr_data.result_links[run_id].description + ' [error]';
            nvrgtr_data.result_links[run_id].link.html(desc);
          } else {  // Run ended normally
            draw_graph = true;
            nvrgtr_data.result_links[run_id].score = score;
            desc = nvrgtr_data.result_links[run_id].description;

            // FIX / IMPLEMENT THIS
            if (desc[0] == 'T') {  // Add number of clusters to threshold result description.
              desc = data.num_clusts[i]+' '+desc;
              nvrgtr_data.result_links[run_id].description = desc;
            }

            nvrgtr_data.result_links.run_descripts.push(desc);
            desc += ' ['+roundFloat(score, 4)+']';
            nvrgtr_data.result_links[run_id].link.html(desc);
            max_dist = parseFloat(data.max_dists[i]);
            if (max_dist > max_var_dist) {
              max_var_dist = max_dist;
            }
          }
        } else if (nvrgtr_data.result_links[run_id].score != score) {
          showErrorPopup("Error: scores from the server don't match existing scores.");
        }
      }
      if (max_var_dist > 0) {
        calculateGlobalNormalization(max_var_dist); // So results are processed every 0.5 sec.
      }
      if (draw_graph == false) {
        nvrgtr_page.check_results_timer = setTimeout(checkIfProcessingDone, nvrgtr_page.check_results_interval);
      } else {
        nvrgtr_data.result_links.scores = data.scores;
        // Indices used to sort by descending result score
        let sorted_inds = [...nvrgtr_data.result_links.run_ids.keys()];
        sorted_inds.sort(function(ind1, ind2) { // Sorts errors to the end
          let cmp = data.scores[ind2] - data.scores[ind1];
          if (isNaN(cmp)) { // At least one score == 'error'
            if (data.scores[ind2] == 'error') {
              return -1;
            } else {
              return 1;
            }
          } else { // Regular scores
            return cmp;
          }
        });
        let num_not_errors = 0;
        for (let i=0; i<data.scores.length; ++i) {
          if (data.scores[i] != 'error') {
            num_not_errors += 1;
          }
        }
        // Sort backend
        nvrgtr_data.result_links.run_ids = sorted_inds.map(function(ind) {
          return nvrgtr_data.result_links.run_ids[ind];
        });
        nvrgtr_data.result_links.scores = sorted_inds.slice(0,num_not_errors).map(function(ind) {
          return nvrgtr_data.result_links.scores[ind];
        });
        nvrgtr_data.result_links.run_descripts = sorted_inds.slice(0,num_not_errors).map(function(ind) {
          return nvrgtr_data.result_links.run_descripts[ind];
        });
        // Sort frontend
        let link, links_list = $("#resultsLinksList");
        for (let i=0; i<nvrgtr_data.result_links.run_ids.length; ++i) {
          link = nvrgtr_data.result_links[nvrgtr_data.result_links.run_ids[i]].link;
          links_list.append(link.parent()); // Removes li from it's current position in links_list, adds it to the end.
        }
        updateScoreGraph();
      }
    },
    error: function(error) { processError(error, "Error checking if the results have finished"); }
  });
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

function updateScoreGraph() {
  if (nvrgtr_settings.graph.total_width == 0) {
    nvrgtr_settings.graph.total_width = $("#scoreGraphSvg").width();
    nvrgtr_settings.graph.total_height = $("#scoreGraphSvg").height();
    console.log('reseting graph dims', $("#scoreGraphSvg").width(), $("#scoreGraphSvg").height());
    nvrgtr_data.graph.g.remove();
    setupScoresGraph();
  }

  if (nvrgtr_data.result_links.run_ids.length == 1) {
    // No action currently taken.
  } else {
    // Update x and y domains:
    nvrgtr_data.graph.x_fxn.domain(nvrgtr_data.result_links.run_descripts);
    nvrgtr_data.graph.y_fxn.domain(
      [ Math.floor(d3.min(nvrgtr_data.result_links.scores)),
        Math.ceil(d3.max(nvrgtr_data.result_links.scores)) ]
    );
    // Update x and y axes with the new domains:
    nvrgtr_data.graph.x_axis.tickValues(nvrgtr_data.result_links.var_nums);
    nvrgtr_data.graph.y_axis.tickValues(nvrgtr_data.graph.y_fxn.ticks(3));
    nvrgtr_data.graph.g.select(".x-axis").call(nvrgtr_data.graph.x_axis)
      .selectAll("text")
        .style("text-anchor", "start")
        .attr("x", 7)
        .attr("y", 5)
        .attr("dy", ".35em")
        .attr("transform", "rotate(55)");
    nvrgtr_data.graph.g.select(".y-axis").call(nvrgtr_data.graph.y_axis);
    // Calculate new margin values, apply to all relevant elements.
    $("#scoreGraphSvg").show();
    let margin = nvrgtr_settings.graph.margin,
      x_axis_bbox = nvrgtr_data.graph.g.select(".x-axis").node().getBBox(),
      y_axis_bbox = nvrgtr_data.graph.g.select(".y-axis").node().getBBox();
    margin.bottom = x_axis_bbox.height;
    margin.left = 16 + y_axis_bbox.width;
    let width = nvrgtr_settings.graph.total_width - margin.left - margin.right,
      height = nvrgtr_settings.graph.total_height - margin.top - margin.bottom;
    nvrgtr_data.graph.x_fxn.range([0, width]);
    nvrgtr_data.graph.y_fxn.range([height, 0]);
    nvrgtr_data.graph.g.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    nvrgtr_data.graph.g.select(".x-axis").attr("transform", "translate(0," + height + ")");
    nvrgtr_data.graph.g.select(".x-axis").call(nvrgtr_data.graph.x_axis)
      .selectAll("text")
        .style("text-anchor", "start")
        .attr("x", 7)
        .attr("y", 5)
        .attr("dy", ".35em")
        .attr("transform", "rotate(55)");
    nvrgtr_data.graph.g.select(".y-axis").call(nvrgtr_data.graph.y_axis);
    //nvrgtr_data.graph.g.select(".x-axis-label").attr("x", width / 2); // NOT CURRENTLY USED
    nvrgtr_data.graph.g.select(".y-axis-label")
      .attr("x", 0 - height/2)
      .attr("y", 12 - margin.left);
    // Update the graph line:
    nvrgtr_data.graph.g.select(".score-line")
      .transition()
      .attr("d", function() { return nvrgtr_data.graph.line_fxn(nvrgtr_data.result_links.scores); });
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
    error: function(error) {
      treeHasLoaded();
      processError(error, "Error rooting the tree");
    }
  });
}
function addAssignedLabelHandlers(label_ele, assigned_key) {
  label_ele.mouseenter(function() {
    var assigned_len = nvrgtr_data[assigned_key].length;
    if (assigned_len == 0) { return false; }
    for (let i=0; i<assigned_len; ++i) {
      nodeLabelMouseoverHandler(nvrgtr_data[assigned_key][i]);
    }
  }).mouseleave(function() {
    var assigned_len = nvrgtr_data[assigned_key].length;
    for (let i=0; i<assigned_len; ++i) {
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
    for (let i=0; i<assigned_len; ++i) {
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
  updateClusteringOptions();
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
  updateClusteringOptions();
}
function nodeLabelMouseoverHandlerCallback(var_name, label_colour) {
  nvrgtr_data.nodes[var_name].variant_select_label[0].style.background = label_colour;
}
function nodeLabelMouseoutHandlerCallback(var_name, label_colour) {
  nvrgtr_data.nodes[var_name].variant_select_label[0].style.background = label_colour;
}
function nodeLabelMouseclickHandlerCallback(var_name, label_colour) {
  nvrgtr_data.nodes[var_name].variant_select_label[0].style.background = label_colour;
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
    data: JSON.stringify({...getPageBasicData(), 'run_ids':nvrgtr_data.result_links.run_ids, 'max_var_dist':max_var_dist, 'global_bins':bins}),
    success: function(data_obj) {
      //var data = $.parseJSON(data_obj);
    },
    error: function(error) { processError(error, "Error calculating global normalization values"); }
  });
}

// =====  Data parsing / validation:
function getValidateFindVariantsArgs() {
  if (!nvrgtr_data.tree_data) {
    return false;
  }
  let num_avail = nvrgtr_data.available.length, num_chosen = nvrgtr_data.chosen.length;
  if (num_avail + num_chosen < 1) {
    showErrorPopup("You must select 1 or more variants from your tree and assign them as 'available' or 'chosen' before NaVARgator can perform clustering.");
    return false;
  }
  let args = [];
  if ($("#capCyclesCheckbox").is(':checked')) {
    if (!( validateSpinner($("#maxCyclesSpinner"), "Max cycles") )) {
      return false;
    }
    args.push($("#maxCyclesSpinner").spinner('value'));
  } else {
    args.push(null);
  }
  if ($("#clustMethodNumberCheckbox").is(':checked')) { // k-based clustering
    if (!( validateSpinner($("#numVarSpinner"), "Variants to find") &&
      validateSpinner($("#rangeSpinner"), "The range of variants to find") &&
      validateSpinner($("#clustToleranceSpinner"), "Cluster tolerance") )) {
      return false;
    }
    let num_vars = parseInt($("#numVarSpinner").spinner('value')), num_vars_range = num_vars;
    if ($("#varRangeCheckbox").is(':checked')) {
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
    args.push(num_vars);
    args.push(num_vars_range);
    args.push(parseFloat($("#clustToleranceSpinner").spinner('value')));
    let cluster_type = $("#kClustMethodSelect").val();
    if (cluster_type == 'k medoids' || cluster_type == 'k minibatch') {
      if (!( validateSpinner($("#clustRandStartsSpinner"), "Random starts") )) {
        return false;
      }
      args.push($("#clustRandStartsSpinner").spinner('value'));
    }
    if (cluster_type == 'k minibatch') {
      if (!( validateSpinner($("#clustBatchSizeSpinner"), "Batch size") )) {
        return false;
      }
      args.push($("#clustBatchSizeSpinner").spinner('value'));
    }
  } else { // Threshold clustering
    let thresh_val = parseFloat($("#thresholdInput").val());
    if (isNaN(thresh_val) || thresh_val < 0) {
      showErrorPopup("The Critical threshold value must be a positive number.");
      return false;
    }
    $("#thresholdInput").val(thresh_val);
    args.push(thresh_val);
    if (!( validateSpinner($("#threshPercentSpinner"), "Threshold percent") )) {
      return false;
    }
    args.push($("#threshPercentSpinner").spinner('value'));
    //let thresh_type = $("#threshClustMethodSelect").val();
    //if (thresh_type == 'qt minimal') {  }
  }
  return args;
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
function generateSigmoidFunction(b, m, r) {
  // Generates the sigmoid function with the given parameters
  return function(x) {
    return (r/2)*(b*(m-x) / Math.sqrt((b*(m-x))**2 + 1) + 1);
  }
}
function generateSigmoidInverse(b, m, r) {
  // Generates the inverse of the sigmoid function with the given parameters
  return function(y) {
    let c = 2*y/r - 1;
    return m - c / (b*Math.sqrt(1-c*c));
  }
}
function setupSpecificHelpButtonText() {
  // Common elements' help messages defined in core.js:setupCoreHelpButtonText()
  // Tree options help:
  //$("#treeOptsHelp .help-text-div").css('width', '500px');
  $("#treeOptsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
  // Assigned variants help:
  $("#assignedVarsHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
  // Export data help:
  $("#exportDataHelp .help-text-div").append("<p>Help and information text to be added soon.</p>");
}
