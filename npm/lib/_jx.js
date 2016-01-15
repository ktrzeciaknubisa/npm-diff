// Copyright & License details are available under JXCORE_LICENSE file

var path = require('path')
var fs = require('fs')
var log = require('npmlog')

var autoremove_arr = null;

// for jxcore related logging
log.addLevel('jxcore', 10000, { fg: 'cyan', bg: 'black' }, 'JXcore')


/**
 * Adds --build-from-source (for node-pre-gyp) to process.argv,
 * to force compiling native addons against JXcore
 * rather than allowing for downloading the prebuilt binaries
 */
exports.checkBuildFromSource = function() {

  var cmd = process.argv[2];

  if (typeof jxcore === 'undefined' || !cmd)
    return;

  // for shortcuts refer to deps/npm/lib/npm.js # 64
  var supportedCommands = [
    'install', 'i', 'isntall',
    'rebuild', 'rb',
    'update', 'up'
  ];

  // other than one of supported commands was issued
  if (supportedCommands.indexOf(cmd) === -1)
    return;

  var arg = '--build-from-source';

  for (var a = 0, len = process.argv.length; a < len; a++) {
    if (process.argv[a].indexOf(arg) > -1)
      return;
  }

  process.argv.push(arg);

  // this is to instruct node-pre-gyp to use node-gyp bundled with npmjx
  process.env["npm_config_node_gyp"] = path.join(__dirname, '../node_modules/node-gyp/bin/node-gyp.js')
};


/**
 * This method is called by npm/lib/install/action/extract.js
 * and replaces "node" occurrences into "jx"
 * @param folder
 */
exports.clear_files = function(folder) {
  var files = fs.readdirSync(folder);

  var isWindows = process.platform === "win32";
  for(var o in files){
    var name = files[o];

    var stat = fs.statSync(folder + path.sep + name);

    if(!stat.isDirectory()){
      var _ext = path.extname(name);
      if(_ext)
        _ext = _ext.toLowerCase().trim();
      else
        _ext = "";
      if(stat.size > 1e6 || _ext == ".node" || _ext == ".dll")
        continue;

      var fstr = fs.readFileSync(folder + path.sep + name) +"";
      var ln = fstr.length;

      if(_ext == ".cmd" || _ext == ".bat")
      {
        fstr = fstr.replace(/node.exe/g, "jx.cmd");
        fstr = fstr.replace(/node /g, "jx ");
      }
      else if(_ext == ".gyp" || name === "Makefile"){
        fstr = exports.replaceForJX(fstr);
      }
      else{
        fstr = fstr.replace(/#![ ]*\/usr\/bin\/env[ ]*node/, "#!/usr/bin/env jx");
        if(fstr.indexOf("#!/bin/sh")>=0 || fstr.indexOf("#! /bin/sh")>=0 || fstr.indexOf("#!/bin/bash")>=0){
          fstr = fstr.replace(/node[ ]+/g, "jx ");
          fstr = fstr.replace(/"$basedir\/node"/g, '"$basedir/jx"');
          fstr = fstr.replace(/'$basedir\/node'/g, "'$basedir/jx'");
        }
      }

      if(fstr.length != ln){
        fs.writeFileSync(folder + path.sep + name, fstr);
      }

    }else{

      if(stat.isDirectory()){
        exports.clear_files(folder + path.sep + name);
      }
    }
  }
}


var delTree = function(loc, checkRemove, cb) {

  var color = jxcore.utils.console.setColor;
  if (fs.existsSync(loc)) {
    var _files = fs.readdirSync(loc);
    var _removed = 0;
    for ( var o in _files) {
      if (!_files.hasOwnProperty(o))
        continue;

      var file = _files[o];
      var _path = loc + path.sep + file;
      if (!fs.lstatSync(_path).isDirectory()) {
        try {
          var removeFile = checkRemove
            && checkRemove(loc, file, _path, false);
          if (!checkRemove || removeFile) {
            fs.unlinkSync(_path);
            _removed++;
            if (removeFile)
              log.jxcore('--autoremove', color(_path.replace(process.cwd(), '.'), "yellow"))
          }
        } catch (e) {
          log.jxcore("Permission denied", loc);
          log.jxcore('', "(do you have a write access to this location?)");
        }
        continue;
      }
      // folders
      var removeDir = checkRemove && checkRemove(loc, file, _path, true);
      if (!checkRemove || removeDir) {
        delTree(_path);
        if (removeDir)
          log.jxcore('--autoremove', color(_path.replace(process.cwd(), '.'), "yellow"))
      } else {
        delTree(_path, checkRemove);
      }
    }

    if (!checkRemove || _removed == _files.length)
      fs.rmdirSync(loc);
  }

  if (cb)
    cb();
};

// makes decision, whether remove file/folder or not
var autoRemove_Check = function(folder, file, _path) {

  var specials = [ "\\", "^", "$", ".", "|", "+", "(", ")", "[", "]",
    "{", "}" ]; // without '*' and '?'

  for ( var o in autoremove_arr) {
    if (!autoremove_arr.hasOwnProperty(o))
      continue;

    var mask = autoremove_arr[o];
    var isPath = mask.indexOf(path.sep) !== -1;

    // entire file/folder basename compare
    if (mask === file)
      return true;

    // compare against entire path (without process.cwd)
    if (isPath
      && _path.replace(process.cwd(), "").indexOf(mask) !== -1)
      return true;

    // regexp check against * and ?
    var r = mask;
    for ( var i in specials) {
      if (specials.hasOwnProperty(i))
        r = r.replace(new RegExp("\\" + specials[i], "g"), "\\"
        + specials[i]);
    }

    var r = r.replace(/\*/g, '.*').replace(/\?/g, '.{1,1}');
    var rg1 = new RegExp('^' + r + '$');
    var rg2 = new RegExp('^' + path.join(folder, r) + '$');
    if (rg1.test(file) || rg2.test(_path))
      return true;
  }

  return false;
};


/*
  Performs --autoremove tasks
 */
exports.autoremove = function(installed, cb) {

  var _exit = function() {
    cb();
  };

  var autoremove_str = process.env.JX_NPM_AUTOREMOVE;
  if (!autoremove_str)
    return _exit();

  try {
    autoremove_arr = JSON.parse(autoremove_str);
  } catch(ex) {
    log.jxcore("Cannot parse JX_NPM_AUTOREMOVE env variable.");
    return _exit();
  }

  if (!autoremove_arr || !autoremove_arr.length)
    return _exit();

  var arr = [];

  for(var a in installed) {
    if (installed.hasOwnProperty(a)) {
      arr.push(installed[a][1]);
    }
  }

  if (!arr.length)
    return _exit();

  var cnt = 0;
  var local_cb = function() {
    cnt++;
    if (cnt === arr.length)
      _exit();
  };

  for(var a = 0, len = arr.length; a < len; a++) {
    delTree(arr[a], autoRemove_Check, function() {
      local_cb()
    });
  }
};

var replaceNode = function(str) {

  /* This regexp covers e.g.:

   <!(node -e "require('nan')\")
   <!(node -e \"require('nan')\")
   "npm install semver && node -e \"require('nan')
   "prepublish": "node ./tools/prepublish.js",

   but not e.g.:

   @node
   "require(\'./tools/NODE_NEXT.js\')"
   /some/path/node/
   */

  var reg = /[^a-zA-Z0-9_\/@\.](node)\s/g;
  var replacement = '{JX}';
  var len = 4; // 4 is length of "node"
  var r = null;
  while (r = reg.exec(str))
    str = str.slice(0, r.index + 1) + replacement + str.slice(r.index + len + 1);

  // test also beginning of string
  if (str.slice(0, len + 1) === 'node ')
    str = replacement + ' ' + str.slice(len + 1);

  return str;
};

var replaceNpm = function(str) {

  var reg = /[^a-zA-Z0-9_\/@\.](npm)\s/g;
  var replacement = '{JX} npm';
  var len = 3; // 3 is length of "npm"
  var r = null;
  while (r = reg.exec(str))
    str = str.slice(0, r.index + 1) + '{JX_NPM}' + str.slice(r.index + len + 1);

  str = str.replace(/\{JX_NPM\}/g, replacement);

  // test also beginning of string
  if (str.slice(0, len + 1) === 'npm ')
    str = replacement + ' ' + str.slice(len + 1);

  return str;
};


var replaceNodeGyp = function(str) {

  var reg = /[^a-zA-Z0-9_\/@\.](node-gyp)\s/g;
  var homeFolder = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
  var replacement = '{JX} ' + path.join(homeFolder, '.jx/npm/node_modules/node-gyp/bin/node-gyp.js');
  var len = 8; // 8 is length of "node-gyp"
  var r = null;
  while (r = reg.exec(str))
    str = str.slice(0, r.index + 1) + '{JX_NODEGYP}' + str.slice(r.index + len + 1);

  str = str.replace(/\{JX_NODEGYP\}/g, replacement);

  // test also beginning of string
  if (str.slice(0, len + 1) === 'node-gyp ')
    str = replacement + ' ' + str.slice(len + 1);

  return str;
};


/*
  Replaces occurrences of "node", "npm" and "node-gyp"
  to corresponded names used by JXcore
 */
exports.replaceForJX = function(str, runtime) {

  // this is to prevent `prebuild` module to download prebuilt binaries
  // and force building against jx
  if (str.indexOf("prebuild --download") !== -1)
    str = "node-gyp rebuild"

  str = replaceNode(str);
  str = replaceNpm(str);
  str = replaceNodeGyp(str);


  var useExecPath = typeof jxcore !== 'undefined' && runtime;
  str = str.replace(/\{JX\}/g, useExecPath ? '\"' + process.execPath + '\"': 'jx');

  return str;
};

