function initMap() {
  var map = new google.maps.Map(document.getElementById('map'), {
      zoom: 11,
      center: { lat: 37.779236, lng: -122.449621 },
      mapTypeControl: false
    });

  initApp(map);
}

function showNoRoute() {
  $('#noroute').show();
}

function hideNoRoute() {
  $('#noroute').hide();
}

function initApp(map) {
  var directionsDisplay = new google.maps.DirectionsRenderer;
  var directionsService = new google.maps.DirectionsService;
  var geocoder = new google.maps.Geocoder;

  directionsDisplay.setMap(map);

  var control = document.getElementById('floating-panel');
  control.style.display = 'block';
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(control);

  initTable();

  $.ajax({
    address: "https://maps.googleapis.com/maps/api/timezone/json?location=39.6034810,-119.6822510&timestamp=1331161200&key=AIzaSyAtDFC3VLvbxSFJ-8tAWIFhVipSdH81Eio"
  }).done(function(reply) {
    console.log(reply);
    if (reply.status == 'OK') {
      console.log(arguments);
    } else {
      showNoRoute();
    }
  });

  return;

  var startShow = function() {
    showDrivingTimes(geocoder, directionsService, directionsDisplay);
  }

  var handleEnter = function(e) {
    if (e.keyCode == 13) {
      startShow();
    }
  }
  $('input').keyup(handleEnter);
  $('#go').click(startShow);
}

function initTable() {
  for (var t = 4; t < 24; t++) {
    var tt;
    if (t == 0) tt = '12am';
    else if (t == 12) tt = '12pm';
    else if (t <= 11) tt = t + 'am';
    else tt = t - 12 + 'pm';

    $('#times').append(
      '<tr id="time-' + t + '">' + 
        '<td class="used_time">' + tt + '</td>' +
        '<td class="time_slot slot_ab"></td>' + 
        '<td class="time_slot slot_ba"></td>' + 
      '</tr>');
  }
}

function ThrottledBatch()  {
  var per_second = 4;
  this.wait_time = 1.0 / per_second * 1000.0;
  this.batch = [];
}

ThrottledBatch.prototype.addRequest = function(func) {
  this.batch.push(func);
}

ThrottledBatch.prototype.executeOne = function(index) {
  var me = this;

  if (index == me.batch.length) {
    return;
  } else {
    
    this.batch[index](function(status) {
      console.log(index, ' -> ', status);
      var timeout;
      if (status == 'OK') {
        setTimeout(function() {
          me.executeOne(index + 1);
        }, me.wait_time);
      } else if (status == 'OVER_QUERY_LIMIT') {
        console.log('Oops, waiting..');
        setTimeout(function() {
          me.executeOne(index);
        }, 1000);
      } else {
        showNoRoute();
      }
    });
  }
}

ThrottledBatch.prototype.execute = function() {
  console.log('Executing', this.batch.length, 'requests');

  this.executeOne(0);
}

function lookupTimeZone(geocoder, location_name, callback) {
  geocoder.geocode( { address: location_name }, function(results, status) {
    if (status == 'OK') {
      var position = results[0].geometry.location;

      // Lookup timezone.
      var params = {
        location: position.lat() + "," + position.lng(),
        key: "AIzaSyAtDFC3VLvbxSFJ-8tAWIFhVipSdH81Eio",
        timestamp: new Date().getTime()
      }

      var url_base = "https://maps.googleapis.com/maps/api/timezone/json?" + $.param(params);
      $.ajax( { address: url_base } ).done(function(data) {
        callback(data);
      });
    } else {
      showNoRoute();
    }
  });
}

function showDrivingTimes(geocoder, directionsService, directionsDisplay) {
  hideNoRoute();
  var start = $('#address-from').val();
  var end = $('#address-to').val();

  lookupTimeZone(geocoder, start, function(position) {
    var batch = new ThrottledBatch();

    var modes = ['ab', 'ba'];

    var route_displayed = false;

    hour_lim = 24;

    for (var hour = 0; hour < hour_lim; hour++) {
      $('#time-' + hour + ' .slot_ab').text('');
      $('#time-' + hour + ' .slot_ba').text('');
    }

    for (var mode_i = 0; mode_i < modes.length; mode_i++) {
      mode = modes[mode_i];

      var hour_from;
      var hour_to;
      if (mode == 'ab') {
        hour_from = 6;
        hour_to = 12;
      }

      if (mode == 'ba') {
        hour_from = 15;
        hour_to = 22;
      }

      for (var hour = hour_from; hour <= hour_to; hour++) {
        var departureDate = new Date();
        var adjust = -(departureDate.getDay() - 1);
        departureDate.setDate(departureDate.getDate() + 7 + adjust);

        console.assert(departureDate.getDay() == 1);

        departureDate.setHours(hour);

        var mystart, myend;
        if (mode == 'ab') {
          mystart = start;
          myend = end;
        } else {
          mystart = end;
          myend = start;
        }
        var params = {
          origin: mystart,
          destination: myend,
          travelMode: 'DRIVING',
          drivingOptions: {
            departureTime: departureDate,
            trafficModel: 'pessimistic'
          }
        };

        var myParams = {
          hour: hour,
          mode: mode
        }

        batch.addRequest(function(params, myParams, done_callback) {
          directionsService.route(params, function(myParams, response, status) {
            if (status === 'OK') {
              if (response.routes.length > 0) {
                var route = response.routes[0];
                var leg = route.legs[0];

                var selector = ' .slot_ab';
                if (myParams.mode == 'ba') {
                  selector = ' .slot_ba';
                }

                if (leg && leg.duration_in_traffic) {
                  $('#time-' + myParams.hour + selector).text(leg.duration_in_traffic.text);
                } 

                if (!route_displayed) {
                  route_displayed = true;
                  directionsDisplay.setDirections(response);
                }
              }
            }

            done_callback(status);

          }.bind(this, myParams));
        }.bind(this, params, myParams));
      }
    }
    batch.execute();
  });


}
