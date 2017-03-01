'use strict';
angular.module('DSCApp',[])
.controller('mainController', ['$scope', '$http', '$interval', function ($scope, $http, $interval) {

    var _piwebapiBaseURL = "https://dfpicoresight.osidf.int:4443/piwebapi/";
    var _piwebapiBaseURLWSS = "wss://arcadia.osisoft.int/piwebapi/";


    var _afserver = "DFPIAF";
    var _afdatabase = "Sandbox";

    var regionTemplateName = "Region";
    var wellTemplateName = "RegionWell";
    var completionTemplate = "Completion";

    $scope.sortType = 'attribute';
    $scope.sortReverse = false;
    

    $scope.init = function () {

        var getRegionsUrl = _piwebapiBaseURL + 'search/query?q=afelementtemplate:"' + regionTemplateName + '"' + '&scope=af:\\\\' + _afserver + '\\' + _afdatabase;

        $http.get(getRegionsUrl, { withCredentials: true }).then(function (response) {
            
            $scope.regions = response.data.Items;

        });

    };
    
    $scope.getWells = function(selectedRegion){

        
        if (!selectedRegion) return;
                
        var regionUrl = selectedRegion.Links.Self;
        var getWellsUrl = _piwebapiBaseURL + 'search/query?q=afelementtemplate:' + wellTemplateName + '&scope=af:';


        var batchRequest = {
            'GetRegionPath': {
                'Method': 'GET',
                'Resource': regionUrl
            },
            'GetWells': {
                'Method': 'GET',
                'Resource': getWellsUrl + "{0}",
                'ParentIds': [
                    'GetRegionPath'
                ],
                'Parameters': ['$.GetRegionPath.Content.Path']
            }

        };

        var batchUrl = _piwebapiBaseURL + 'batch';

        $http.post(batchUrl, JSON.stringify(batchRequest), {
            withCredentials: true, headers: {
                'Content-Type': 'application/json',
            }
        }).then(function (response) {

            $scope.wells = response.data.GetWells.Content.Items;
          

        });


    };

    $scope.getCompletions = function (selectedWell) {


        if (!selectedWell) return;

        var wellUrl = selectedWell.Links.Self;
        var getCompletionsUrl = _piwebapiBaseURL + 'search/query?q=afelementtemplate:' + completionTemplate + '&scope=af:';


        var batchRequest = {
            'GetWellPath': {
                'Method': 'GET',
                'Resource': wellUrl
            },
            'GetCompletions': {
                'Method': 'GET',
                'Resource': getCompletionsUrl + "{0}",
                'ParentIds': [
                    'GetWellPath'
                ],
                'Parameters': ['$.GetWellPath.Content.Path']
            }

        };

        var batchUrl = _piwebapiBaseURL + 'batch';

        $http.post(batchUrl, JSON.stringify(batchRequest), {
            withCredentials: true, headers: {
                'Content-Type': 'application/json',
            }
        }).then(function (response) {

            $scope.completions = response.data.GetCompletions.Content.Items;
            
            //$scope.completions.forEach(function (completion) {
            //    var uri = _piwebapiBaseURLWSS + "/streamsets/" + completion.WebId + "/channel?includeIntialValues=true";
            //    var webSocket = new WebSocket(uri);
                
            //    webSocket.onmessage = function (event) {
            //        console.log("event: ",event);
            //    };

            //});
         


            
        });


    };



    $scope.getAttributes = function (selectedCompletion) {

        $scope.attributesAndTags = _.compact(selectedCompletion.Attributes.map(function (att) {
            var property = _.findWhere(att.Attributes, { Name: "Instrument Tag" });
            if (property) { return { Attribute: att, InstrumentTag: property, Value: property.Value, Status: "", Selected: false, Hide: false}}
            

        }));

        
        singleStatusCheck();
        startStatusCheck();
        


    };

    function getData(){
        var getdataUri = _piwebapiBaseURL + "/streamsets/value?"

        $scope.attributesAndTags.forEach(function (attribute) {

            getdataUri += "webid=" + attribute.Attribute.WebId + "&";

        });

        getdataUri = getdataUri.slice(0, -1);

        return $http.get(getdataUri, { withCredentials: true }).then(function (response) {

            return response.data;

        });
    
    };

    function singleStatusCheck() {

            var promise = getData();

            promise.then(function (data) {
                data.Items.forEach(function (item) {
                    var attritem = _.filter($scope.attributesAndTags, function (at) { return at.Attribute.Name == item.Name })[0];
                    attritem.Status = item.Value.Good ? 'Success. Details: Last value received - ' + item.Value.Value + ", " + item.Value.Timestamp : 'Waiting for data updates';

                    if (item.Value.Value.startsWith("PI Point not found") && typeof (item.Value.Value) == "string")
                    {
                        attritem.Hide = true;
                    }
                });
            }
            );
    };


    var stop;
    function startStatusCheck() {
        //iterations: by default interface checks for point updates every 120 seconds. Interface loads points updates in chunks (25 tags), it waits for 30 seconds in between the loads.
        var iterations = Math.ceil($scope.attributesAndTags.length / 25);

            stop = $interval(function (iteration) {

                var promise = getData();

                promise.then(function (data) {
                    data.Items.forEach(function (item) {
                        var attritem = _.filter($scope.attributesAndTags, function (at) { return at.Attribute.Name == item.Name })[0];
                        attritem.Status = item.Value.Good ? 'Success. Details: Last value received - ' + item.Value.Value + ", " + item.Value.Timestamp : 'Waiting for data updates';

                        if (iteration === iterations && !(item.Value.Good)) {
                            attritem.Status = "Error: attribute is not updating. Current status is: " + item.Value.Value.Name + ", " + item.Value.Timestamp;
                        }

                    });
                }
                );

        }, 10000, iterations);


    };



    $scope.updateAttributes = function () {

        var selectedItems = _.filter($scope.attributesAndTags, function(attributeAndTag){ return attributeAndTag.Selected == true });

        if (selectedItems.length) {

            var batchRequest = {};

            
            selectedItems.forEach(function (item) {

                var putUrl = _piwebapiBaseURL + "attributes/" + item.InstrumentTag.WebId + "/value";
                var value = { 'Timestamp':'*','Value': item.Value };

                var updateDRUrl = _piwebapiBaseURL + "attributes/" + item.Attribute.WebId + "/config";

                   
                    batchRequest["SetValuefor" + item.Attribute.Name] = {
                        'Method': 'PUT',
                        'Resource': putUrl,
                        'Content': JSON.stringify(value)
                    };

                    batchRequest["UpdateDRfor" + item.Attribute.Name] = {
                        'Method': 'POST',
                        'Resource': updateDRUrl,
                        "ParentIds": [
									"SetValuefor" + item.Attribute.Name
                        ]
                    };


            });
            
            var batchUrl = _piwebapiBaseURL + 'batch';

           

            $http.post(batchUrl, JSON.stringify(batchRequest), {
                withCredentials: true, headers: {
                    'Content-Type': 'application/json',
                }
            }).then(function (response) {


                $scope.generalStatus = response.status == 207 ? '' : response.statusText;
                
                //selectedItems.forEach(function (item) {                  
                    
                //    item.Status = response.data["SetValuefor" + item.Attribute.Name].Status == 204 ? 'The new Instrument Tag value was set successfully.\n' : response.data[setvalueRequestName].Content;
                //    item.Status +=  response.data["UpdateDRfor" + item.Attribute.Name].Status == 201 ? 'PI Point was updated successfully.' : response.data[updateDRRequestName].Content;



                //});
                
                

            //    console.log(response);

            });

        }


    };

    $scope.showAll = function () {
        if ($scope.isShowAllChecked) {
            $scope.attributesAndTags.forEach(function (attributeAndTag) {
                attributeAndTag.Hide = false;
            });
        } else {
            singleStatusCheck();
        }
    };

    
    
    var lastSelectedRow;
    document.onselectstart = function () {
        return false;
    }

    $scope.RowClick = function (currentRow, lock) {
        if (window.event.ctrlKey) {
            toggleRow(currentRow);
        }

        if (window.event.button === 0) {
            if (!window.event.ctrlKey && !window.event.shiftKey) {
                clearAll();
                toggleRow(currentRow);
            }

            if (window.event.shiftKey) {
                selectRowsBetweenIndexes([lastSelectedRow, currentRow])
            }
        }
    }

    function toggleRow(row) {
        row.Selected = !row.Selected;
        lastSelectedRow = row;
    }

    function selectRowsBetweenIndexes(rows) {

        var rowIndexes = [$scope.attributesAndTags.indexOf(rows[0]), $scope.attributesAndTags.indexOf(rows[1])]

        var startIndex = _.min(rowIndexes);
        var lastIndex = _.max(rowIndexes) + 1;


        for (var i = startIndex ; i < lastIndex; i++) {
            $scope.attributesAndTags[i].Selected = true;
        }


    }

    function clearAll() {
        $scope.attributesAndTags.forEach(function (attributesAndTag) {
            attributesAndTag.Selected = false;
        });
        
    }




}]);
