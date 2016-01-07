// Copyright & License details are available under JXCORE_LICENSE file


var path = require('path');
var fs = require('fs');

var srcDir = '/Users/nubisa_krzs/Documents/GitHub/jxcore/deps/';
var srcDir = '/Users/nubisa_krzs/Documents/GitHub/node-0.10.29/deps/';


var checkNext = function(dir) {
  setTimeout(function() {
    //console.log(' new', dir);
    checkDir(dir);
  }, 1);
};

var checkDir = function(dir) {

  //console.log('checkdir', dir);
  var files = fs.readdirSync(dir);
  for(var o in files) {
    var f = files[o];
    var ff = path.join(dir, f);
    var stat = fs.statSync(ff);

    if (stat.isDirectory()) {
      checkNext(ff);
    } else {
      // npm dir int this repo
      var ff2 = ff.replace(srcDir, __dirname + '/');
      if (!fs.existsSync(ff2))
        continue;
      var stat2 = fs.statSync(ff2);

      //var mode = fs.chmodSync(ff);
      //var mode2 = fs.chmodSync(ff2);

      //if (ff.indexOf('request/node_modules/hawk/test/browser.js') !== -1) {
        //console.log(mode, mode2);
        //(stat.mode & parseInt ("777", 8)).toString (8)[0]
        //console.log(ff, stat.mode);
        //console.log(ff, stat.mode, (stat.mode & parseInt ("777", 8)).toString (8)[0]);
        //console.log(ff2, stat2.mode);
      //}

      if (stat.mode !== stat2.mode) {
        console.log(ff, stat.mode);
        fs.chmodSync(ff2, stat.mode);
      }
      //  console.log('1.', ff);
      //  console.log('2.', ff2);
    }
  }

};



checkDir(path.join(srcDir, 'npm'));