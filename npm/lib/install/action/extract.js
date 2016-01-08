'use strict'
var updatePackageJson = require('../update-package-json')
var npm = require('../../npm.js')
var packageId = require('../../utils/package-id.js')
var cache = require('../../cache.js')

module.exports = function (top, buildpath, pkg, log, next) {
  log.silly('extract', packageId(pkg))
  var up = npm.config.get('unsafe-perm')
  var user = up ? null : npm.config.get('user')
  var group = up ? null : npm.config.get('group')
  cache.unpack(pkg.package.name, pkg.package.version
        , buildpath
        , null, null, user, group,
        function (er) {
          if (er) return next(er)
          updatePackageJson(pkg, buildpath, next)
        })
}

function clear_files(folder){
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
        fstr = fstr.replace(/node[ ]*-e[ ]*"require/g, "jx -e \"require");
        fstr = fstr.replace(/node[ ]*-e[ ]*'require/g, "jx -e 'require");

        // this one covers the two above plus also escaping slashes
        fstr = fstr.replace(/node\s+-e\s+(\\?["|'])require/g, "jx -e $1require");
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
        clear_files(folder + path.sep + name);
      }
    }
  }
}

var pre_clear = function(pkg, buildpath, next){
  updatePackageJson(pkg, buildpath, next)
  clear_files(targetFolder);
}

