var kAPIURL = "https://crash-stats.allizom.org/api/AduBySignature/";

function makeQueryURL(base, map) {
  var q = map.entries().map(function(d) {
    return encodeURIComponent(d.key) + "=" + encodeURIComponent(d.value);
  }).join("&");
  return base + "?" + q;
}

function objectFromQuery() {
  var query = location.search.substr(1);
  var result = d3.map();
  query.split("&").forEach(function(part) {
    var item = part.split("=");
    result.set(item[0], decodeURIComponent(item[1]));
  });
  return result;
}

var gBuildIDParser = d3.time.format.utc("%Y%m%d%H%M%S").parse;
function buildIDToDate(bid) {
  return gBuildIDParser(bid);
}

var MS_PER_DAY = 1000 * 60 * 60 * 24;

function dateAdd(d, ms) {
  return new Date(d.getTime() + ms);
}

function Dimensions(o) {
  if (!(this instanceof Dimensions)) {
    throw Error("Use new Dimensions()");
  }
  if (o !== undefined) {
    for (var k in o) {
      this[k] = o[k];
    }
  }
}
Dimensions.prototype.radius = function() {
  return Math.min(this.width, this.height) / 2;
};
Dimensions.prototype.totalWidth = function() {
  return this.width + this.marginLeft + this.marginRight;
};
Dimensions.prototype.totalHeight = function() {
  return this.height + this.marginTop + this.marginBottom;
};
Dimensions.prototype.transformUpperLeft = function(e) {
  e.attr("transform", "translate(" + this.marginLeft + "," + this.marginTop + ")");
};
Dimensions.prototype.transformCenter = function(e) {
  e.attr("transform", "translate(" + (this.marginLeft + this.width / 2) + "," +
         (this.marginTop + this.height / 2) + ")");
};
Dimensions.prototype.setupSVG = function(e) {
  e.attr({
    width: this.totalWidth(),
    height: this.totalHeight()
  });
};

function makeDate(s, defaultDelta) {
  if (s == "") {
    return dateAdd(new Date(), defaultDelta);
  }
  return new Date(s);
}

function fillForm(f, q) {
  var els = f.property("elements");
  q.forEach(function(k, v) {
    if (k == "") {
      return;
    }
    els[k].value = v;
  });
}

var gQuery = objectFromQuery();
fillForm(d3.select("#setup"), gQuery);
var gChannel = gQuery.get("channel");
var gSignature = gQuery.get("signature");
var gEndDate = makeDate(gQuery.get("endDate"), 0);
var gStartDate = makeDate(gQuery.get("startDate"), -MS_PER_DAY * 59);
var gData;

var ymd = d3.time.format("%Y-%m-%d");

function fetchData() {
  var qm = d3.map();
  qm.set("channel", gChannel);
  qm.set("product_name", "Firefox");
  qm.set("signature", gSignature);
  qm.set("end_date", ymd(gEndDate));
  qm.set("start_date", ymd(gStartDate));
  var url = makeQueryURL(kAPIURL, qm);
  d3.json(url, function(err, data) {
    if (err) {
      console.warn(err);
      return;
    }
    gData = data;
    buildGraph();
  });
}

function buildGraph() {
  var data = d3.nest()
    .key(function(d) { return d.buildid; })
    .rollup(function(dlist) {
      var r = {
        adu_count: d3.sum(dlist, function(d) { return d.adu_count; }),
        crash_count: d3.sum(dlist, function(d) { return d.crash_count; })
      };
      if (r.adu_count) {
        r.ratio = r.crash_count / r.adu_count;
      }
      return r;
    })
    .sortKeys()
    .entries(gData.hits).filter(function(d) {
      return d.values.ratio !== undefined;
    });

  var adus = data.map(function(d) { return d.values.adu_count; });
  adus.sort(d3.ascending);
  var cutoff = d3.quantile(adus, 0.2);
  console.log(cutoff);
  data = data.filter(function(d) { return d.values.adu_count > cutoff; });

  var tr = d3.select("#mainData > thead").selectAll("tr")
    .data(data)
    .enter().append("tr");
  tr.append("th").text(function(d) { return d.key; });
  tr.append("td").text(function(d) { return d.values.adu_count; });
  tr.append("td").text(function(d) { return d.values.crash_count; });

  var dims = new Dimensions({
    width: 800,
    height: 250,
    marginTop: 5,
    marginLeft: 95,
    marginRight: 5,
    marginBottom: 130
  });

  var minx = buildIDToDate(data[0].key);
  var maxx = buildIDToDate(data[data.length - 1].key);
  var x = d3.time.scale()
    .range([0, dims.width])
    .domain([minx, maxx]);
  var xaxis = d3.svg.axis()
    .scale(x)
    .orient("bottom");

  var maxy = d3.max(data, function(d) { return d.values.ratio; });
  var y = d3.scale.linear()
    .rangeRound([0, dims.height])
    .domain([maxy, 0]);
  var yaxis = d3.svg.axis()
    .scale(y)
    .ticks(4)
    .orient("left");

  var svgg = d3.select("#mainGraph")
    .call(function(d) { dims.setupSVG(d); })
    .append("g").call(function(d) { dims.transformUpperLeft(d); });

  svgg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + dims.height + ")")
    .call(xaxis);

  svgg.append("text")
    .text("Build Date")
    .attr("x", dims.width / 2)
    .attr("y", dims.height + 22)
    .attr("dominant-baseline", "hanging");

  svgg.append("g")
    .attr("class", "y axis")
    .call(yaxis);
  svgg.append("text")
    .text("Crashes/ADU")
    .attr("transform", "translate(" + (-dims.marginLeft + 5) + "," + (dims.height / 2) + ") rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "hanging");

  var points = svgg.selectAll(".point")
    .data(data)
    .enter()
    .append("circle")
    .attr("class", "point main")
    .attr("cx", function(d) { return x(buildIDToDate(d.key)); })
    .attr("cy", function(d) { return y(d.values.ratio); })
    .attr("r", 3);
}

if (gSignature != "" && gEndDate.getTime() && gStartDate.getTime()) {
  fetchData();
}

