'use strict';

var esri2geo = require('esri2geo');
var projector = require('nodetiles-core').projector;
var Promise = require('bluebird');
var request = require('request');

// TODO: Add metrics

Promise.promisifyAll(request);

var remoteSR = '4326';
var remoteProjection = 'EPSG:' + remoteSR;

exports.create = function create(options) {
  var endpoint = options.query.endpoint;
  var pkey = options.query.pkey;
  // TODO: Support passing a where-clause to the server
  //var query = options.query;

  function getShapes(minX, minY, maxX, maxY, mapProjection, done) {
    // Set up the coordinates we need.
    var sw = [minX, minY];
    var ne = [maxX, maxY];

    // project request coordinates into remote datasource coordinates
    if (mapProjection !== remoteProjection) {
      sw = projector.project.Point(mapProjection, remoteProjection, sw);
      ne = projector.project.Point(mapProjection, remoteProjection, ne);
    }

    var qs = {
      geometry: [sw[0], sw[1], ne[0], ne[1]].join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: remoteSR,
      outFields: '*',
      returnGeometry: 'true',
      outSR: remoteSR,
      returnIdsOnly: 'false',
      returnCountOnly: 'false',
      orderByFields: pkey,
      returnZ: 'false',
      returnM: 'false',
      returnDistinctValues: 'false',
      f: 'json'
    };

    //  If the map projection doesn't match the remote datasource projection, we
    //  need to convert.
    var project;
    if (remoteProjection !== mapProjection) {
      project = function (feature) {
        return projector.project.Feature(remoteProjection, mapProjection, feature);
      };
    }
    
    // TODO: Get results in pages for large result sets.
    request.getAsync({
      url: endpoint + '/query',
      gzip: true,
      qs: qs
    }).spread(function (response, body) {
      if (response.statusCode !== 200) {
        throw {
          name: 'EsriError',
          message: 'Received status ' + response.statusCode + ' from URL ' + endpoint + '/query and query params ' + JSON.stringify(qs)
        };
      }

      var data = JSON.parse(body);

      // Convert Esri JSON to GeoJSON
      var fc = esri2geo(data);
      if (project) {
        fc.features = fc.features.map(function (feature) {
          return project(feature);
        });
      }

      done(null, fc);
    }).catch(function (error) {
      console.log(error);
      console.log(error.stack);
      done(error);
    });
  }

  return {
    sourceName: options.name || 'localdata',
    getShapes: getShapes
  };
};