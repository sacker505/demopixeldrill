proj4.defs("EPSG:3577", "+proj=aea +lat_1=-18 +lat_2=-36 +lat_0=0 +lon_0=132 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
var content = document.getElementById('popup-content');
var l_bbox;
var latlong;
var dataObj = [];
var dataPart = new Object;
var g_bandData = [];
var g_count = 0;
var l_divideBy = 10000;
/**
 * Elements that make up the popup.
 */
var container = document.getElementById('popup');
var content = document.getElementById('popup-content');
var closer = document.getElementById('popup-closer');
/**
 * Create an overlay to anchor the popup to the map.
 */
var overlay = new ol.Overlay(/** @type {olx.OverlayOptions} */
({
    element: container,
    autoPan: true,
    autoPanAnimation: {
        duration: 250
    }
}));
/**
 * Add a click handler to hide the popup.
 * @return {boolean} Don't follow the href.
 */
closer.onclick = function() {
    overlay.setPosition(undefined);
    closer.blur();
    return false;
}


/**
 * Create the map.
 */
var map = new ol.Map({
    layers: [new ol.layer.Tile({
        source: new ol.source.TileJSON({
            url: 'http://api.tiles.mapbox.com/v3/' + 'mapbox.natural-earth-hypso-bathy.json',
            crossOrigin: 'anonymous'
        })
    })],
    overlays: [overlay],
    target: 'map',
    view: new ol.View({
        center: [12956382.042450512, -3698329.176549968],
        zoom: 8
    })
})


function requestWmsUrl(coords, wmsUrl, loadJsonFunc) {
    var l_getCapURL = wmsUrl + "?service=WMS&version=1.3.0&request=GetCapabilities";
    var l_parser = new ol.format.WMSCapabilities();
    //GetCapabilities of tile
    fetch(l_getCapURL).then(function(l_response) {
        return l_response.text();
    }).then(function(text) {
        var l_result = l_parser.read(text);
        l_sensorbands = [];
        for (let cap_layer of l_result.Capability.Layer.Layer[0].Layer) {
            l_sensorbands.push(cap_layer.Name)
        }
        content.innerHTML += ("<p>Got results with bands:</p><code>" + l_sensorbands + "</code>")
        var l_times = l_result.Capability.Layer.Layer[0].Layer[0].Dimension[0].values
        var l_aBit = 0.00001
        var l_bbox = (coords[0] - l_aBit) + "%2C" + (coords[1] - l_aBit) + "%2C" + (coords[0] + l_aBit) + "%2C" + (coords[1] + l_aBit)
        //content.innerHTML += ("<p>Got timestamps:</p><code>" + l_times.split(',').length + "</code>");
        g_bandData = [];
        g_count = 0;
        content.innerHTML += ("<p>Processing results</p>");
        for (let l_sensorname of l_sensorbands) {
            var l_getFeatureInfoURL = wmsUrl + "?LAYERS=" + l_sensorname + "&QUERY_LAYERS=" + l_sensorname + "&TIME=" + l_times + "&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&EXCEPTIONS=application%2Fvnd.ogc.se_inimage&FORMAT=text%2Fxml&SRS=EPSG%3A4326&bbox=" + l_bbox + "&X=0&Y=0&INFO_FORMAT=text%2Fxml&WIDTH=1&HEIGHT=1"
            //l_getFeatureInfoURL = l_sensorname+".xml"
            fetch(l_getFeatureInfoURL).then(function(l_response) {
                return l_response.text();
            }).then(function(l_response) {
                doc = ol.xml.parse(l_response)
                var l_parseDate = d3.time.format("%Y-%m-%dT%H:%M:%S.%LZ").parse
                node = doc.childNodes[0]
                for (var i = 0, ii = node.children.length; i < ii; i++) {
                    var layer = node.children[i];
                    if (layer.nodeName !== "FeatureInfo") {
                        continue;
                    }
                    ts = layer.children[0].innerHTML;
                    ts = l_parseDate(ts);
                    val = layer.children[1].innerHTML;
                    val = parseFloat(val / l_divideBy);
                    //l_bandNumber = parseInt(l_sensorname.substr(l_sensorname.indexOf("_")+1));
                    g_bandData.push({
                        band: l_sensorname,
                        time: ts,
                        value: val
                    })
                }
                //onNewData(l_sensorname, g_bandData)
                g_count += 1;
                if (g_count == l_sensorbands.length) {
                    loadJsonFunc(g_specName);
                }
            });
        }
    });
}


var g_DateParser = d3.time.format("%Y-%m-%dT%H:%M:%SZ")

function requestNCSS(ll_coord, endpointUrl, variables) {
    variables_request = variables.join(',')
    requestUrl = endpointUrl + "?latitude=" + ll_coord[1] + "&longitude=" + ll_coord[0] + "&var=" + variables_request + "&temporal=all&accept=csv"
    d3.csv(requestUrl)
        .row(function(d) {
            var row = {}
            for (k in d) {
                if (k == 'time') {
                    row[k] = g_DateParser.parse(d[k])
                }
                else if (k.indexOf('[') == -1) {
                    row[k] = d[k]
                } else {
                    new_key = k.substr(0, k.indexOf('['))
                    row[new_key] = d[k]
                }
            }
            return row
        })
        .get(function(error, rows) {
            data = []
            for (i in rows) {
                row = rows[i]
                for (v in variables){
                    var_name = variables[v]
                    var_val = +row[var_name]
                    if (var_val != -1) {
                        data.push({
                            x: row.time,
                            band: var_name,
                            c: v,
                            y: var_val
                        })
                    }
                }
            }
            data.sort(function(a,b){
              // Turn your strings into dates, and then subtract them
              // to get a value that is either negative, positive, or zero.
              return b.x - a.x;
            })
            console.log(data)
            g_bandData = data
            g_specName = 'graphspec_stacked.json'
            createGraph1(g_specName)
        })
}


function convertLatLonToAlbersTile(coordinate) {
    //Tile index function, used to translate the tile index select. This should not be a client side function, but will do for now.
    var l_tileIndex = function(metres) {
        return Math.floor(metres / 100000)
    }
    return ol.proj.transform(coordinate, 'EPSG:4326', 'EPSG:3577').map(l_tileIndex);
}


function getEndPointURL(product, ll_coord) {
    var tile = convertLatLonToAlbersTile(ll_coord)
    return "http://dapds00.nci.org.au/thredds/ncss/uc0/rs0_dev/all_the_ncmls/" + product + "/ncml/" + product + "_" + tile[0] + "_" + tile[1] + ".ncml"
}


map.on('singleclick', function(evt) {
    deleteGraph();
    var ll_coord = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');
    var endpointUrl = getEndPointURL('LS5_TM_FC', ll_coord)
    //     content.innerHTML = '<p>You clicked on coord:</p><code>' + l_spatialTransform + '</code>';
    //     content.innerHTML += '<p>You clicked on tile:</p><code>' + tile + '</code>';
    //     requestWmsUrl(ll_coord, l_wmsURL, createGraph1)
    requestNCSS(ll_coord, endpointUrl, ['BS', 'PV', 'NPV'])
    overlay.setPosition(evt.coordinate);
})
