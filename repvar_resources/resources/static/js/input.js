// core.js then core_tree_functions.js are loaded before this file.

// =====  Page settings:
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'browser_id':'', 'maintain_interval':2000, 'instance_closed':false, 'maintain_interval_obj':null, 'max_upload_size':20000000
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
      'tree':null, 'marker_radius':4, 'bar_chart_height':0, 'inner_label_buffer':3, 'bar_chart_buffer':0, 'search_buffer':5
    },
    'colours' : {
      'node':'#E8E8E8', 'chosen':'#24F030', 'available':'#F09624', 'ignored':'#5D5D5D', 'search':'#B0F1F5'
    }
  }
};

// =====  Page setup:
function setupPage() {
  $(".jq-ui-button").button(); // Converts these html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
  page.session_id = location.search.slice(1);
  page.browser_id = generateBrowserId(10);
  var tree_width_str = getComputedStyle(document.getElementById("mainTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));

  setupTreeElements();
  setupRunOptions();
  setupNodeSelection();
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
  $("#chosenButton").button('disable');
  $("#availButton").button('disable');
  $("#ignoreButton").button('disable');
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
  $("#chosenButton").click(function() {
    showNodeSelection('chosen', repvar.chosen, repvar.ignored);
  });
  $("#availButton").click(function() {
    showNodeSelection('available', repvar.available, repvar.ignored.concat(repvar.chosen));
  });
  $("#ignoreButton").click(function() {
    showNodeSelection('ignored', repvar.ignored, repvar.chosen);
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
      cluster_method = $("#clustMethodSelect").val();
    // Have to open the page directly from the user's click to avoid popup blockers.
    var first_result_page = window.open('', '_blank');

    $.ajax({
      url: daemonURL('/find-variants'),
      type: 'POST',
      data: {'session_id': page.session_id, 'chosen':repvar.chosen, 'available':repvar.available, 'ignored':repvar.ignored, 'cluster_method':cluster_method, 'num_vars':num_vars, 'vars_range':vars_range},
      success: function(data_obj) {
        page.session_id = $.parseJSON(data_obj);
        var results_url = page.server_url + '/results?' + page.session_id, result_description, result_link_obj;
        first_result_page.location.href = results_url;
        for (var var_num=num_vars_int; var_num<=vars_range_int; ++var_num) {
          // Have to provide links because Chrome only allows 1 tab to open from 1 click.
          results_url = page.server_url + '/results?' + page.session_id;
          result_description = var_num + ' representative variants';
          result_link_obj = $('<a>', {
            text:result_description, title:result_description, href:results_url, target:'_blank'
          }).wrap('<li class="result-link-li">').parent();
          $("#resultsLinksList").append(result_link_obj);
        }
        $("#resultsLinksDiv").show();
      },
      error: function(error) { processError(error, "Server error in finding variants"); }
    });

  });
}
function setupNodeSelection() {
  $("#nodeSelectAll").change(function() {
    if ($(this).is(':checked')) {
      $(".node-select-checkbox").filter(':enabled').prop('checked', true);
    } else {
      $(".node-select-checkbox").filter(':enabled').prop('checked', false);
    }
  });
  $("#nodeSelectSaveButton").click(function() {
    var node_list = [];
    $(".node-select-checkbox").filter(':checked').each(function() {
      node_list.push($(this).prop('name'));
    });
    var node_type = $("#nodeSelectSpan").html();
    if (node_type == 'available') {
      repvar.available = node_list;
    } else if (node_type == 'chosen') {
      repvar.available = $.grep(repvar.available, function(n, i) { return (node_list.indexOf(n) == -1) });
      repvar.chosen = node_list;
    } else if (node_type == 'ignored') {
      repvar.available = $.grep(repvar.available, function(n, i) { return (node_list.indexOf(n) == -1) });
      repvar.ignored = node_list;
    } else {
      showErrorPopup("Error updating node selection.");
    }
    $("#mainNodeSelectDiv").hide();
    updateRunOptions();
  });
  $("#nodeSelectCancelButton").click(function() {
    $("#mainNodeSelectDiv").hide();
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
    updateRunOptions();
    updateNodeSelection();
    $("#uploadFileInput").val('');
    $("#saveRepvarButton").button('enable');
    $("#uploadFileButton").button('disable');
    $("#resultsLinksDiv").hide();
    $(".result-link-li").remove();
  }
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
  $("#chosenButton").button('enable');
  $("#availButton").button('enable');
  $("#ignoreButton").button('enable');
  updateVariantMarkers();
}
function updateNodeSelection() {
  // Updates the list of variant checkboxes in the node selection pane. Should be called every time the phylogenetic tree is modified.
  $('#nodeSelectCheckboxes > .node-select-checkbox-label').remove();
  for (var i=0; i<repvar.leaves.length; ++i) {
    var checkbox = $('<label class="node-select-checkbox-label"><input type="checkbox" class="node-select-checkbox" />'+repvar.leaves[i]+'</label>');
    checkbox.children().prop('name', repvar.leaves[i]);
    $("#nodeSelectCheckboxes").append(checkbox);
  }
}
function showNodeSelection(selecting_for, checked_if_in, disabled_if_in) {
  $("#nodeSelectSpan").html(selecting_for);
  $("#chosenButton").button('disable');
  $("#availButton").button('disable');
  $("#ignoreButton").button('disable');
  // Prepare the node selection checkboxes:
  if (checked_if_in.length == repvar.leaves.length) {
    $("#nodeSelectAll").prop('checked', true);
  } else {
    $("#nodeSelectAll").prop('checked', false);
  }
  $(".node-select-checkbox").each(function() {
    var checkbox = $(this);
    var name = checkbox.prop('name');
    if (checked_if_in.indexOf(name) != -1) {
      checkbox.prop('checked', true);
    } else {
      checkbox.prop('checked', false);
    }
    if (disabled_if_in.indexOf(name) != -1) {
      checkbox.attr('disabled', true);
    } else {
      checkbox.attr('disabled', false);
    }
  });
  $("#mainNodeSelectDiv").show();
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
  if (data.hasOwnProperty('maintain_interval')) {
    page.maintain_interval = data.maintain_interval * 1000;
  }
}
