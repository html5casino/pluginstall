var fs = require('../util/fs'), // use existsSync in 0.6.x
    path = require('path'),
    mkdirp = require('mkdirp'),
    et = require('elementtree'),
    nCallbacks = require('../util/ncallbacks'),
    asyncCopy = require('../util/asyncCopy'),
    xmlHelper = require('../util/xml-helpers'),
    getConfigChanges = require('../util/config-changes'),
    searchAndReplace = require('../util/searchAndReplace'),
    assetsDir = 'assets/www', // relative path to project's web assets
    sourceDir = 'src',
    counter = {};

exports.installPlugin = function (config, plugin, callback) {
    // look for assets in the plugin 
    var assets = plugin.xmlDoc.findall('./asset'),
        platformTag = plugin.xmlDoc.find('./platform[@name="android"]'),
        sourceFiles = platformTag.findall('./source-file'),
        libFiles = platformTag.findall('./library-file'),
        PACKAGE_NAME = packageName(config),
        configChanges = getConfigChanges(platformTag),
        callbackCount = assets.length + sourceFiles.length + libFiles.length,
        endCallback;

    // find which config-files we're interested in
    Object.keys(configChanges).forEach(function (configFile) {
        if (fs.existsSync(path.resolve(config.projectPath, configFile))) {
            callbackCount++;
        } else {
            delete configChanges[configFile];
        }
    });
    
    endCallback = nCallbacks(callbackCount, function(err) {
      if (err) throw err;

      config.variables["PACKAGE_NAME"] = PACKAGE_NAME;

      for (key in config.variables) {
        searchAndReplace(config.projectPath + '/res/xml/plugins.xml', 
          '\\$' + key,
          config.variables[key]
        );
        searchAndReplace(config.projectPath + '/res/xml/config.xml', 
          '\\$' + key,
          config.variables[key]
        );
        searchAndReplace(config.projectPath + '/AndroidManifest.xml', 
          '\\$' + key,
          config.variables[key]
        );
      }
      callback();
    });

    // move asset files
    assets.forEach(function (asset) {
        var srcPath = path.resolve(
                        config.pluginPath,
                        asset.attrib['src']);

        var targetPath = path.resolve(
                            config.projectPath,
                            assetsDir,
                            asset.attrib['target']);

        asyncCopy(srcPath, targetPath, endCallback);
    });

    // move source files
    sourceFiles.forEach(function (sourceFile) {
        var srcDir = path.resolve(config.projectPath,
                                sourceFile.attrib['target-dir'])

        mkdirp(srcDir, function (err) {
            var srcFile = srcPath(config.pluginPath, sourceFile.attrib['src']),
                destFile = path.resolve(srcDir,
                                path.basename(sourceFile.attrib['src']));

            asyncCopy(srcFile, destFile, endCallback);
        });
    })
    
    // move library files
    libFiles.forEach(function (libFile) {
        var libDir = path.resolve(config.projectPath,
                                libFile.attrib['target-dir'])

        mkdirp(libDir, function (err) {
            var src = path.resolve(config.pluginPath, 'src/android',
                                        libFile.attrib['src']),
                dest = path.resolve(libDir,
                                path.basename(libFile.attrib['src']));
            console.log(src, dest);

            asyncCopy(src, dest, endCallback);
        });
    })

    // edit configuration files
    Object.keys(configChanges).forEach(function (filename) {
        var filepath = path.resolve(config.projectPath, filename),
            xmlDoc = xmlHelper.readAsETSync(filepath),
            output;

        configChanges[filename].forEach(function (configNode) {
            var selector = configNode.attrib["parent"],
                children = configNode.findall('*');

            if (!xmlHelper.addToDoc(xmlDoc, children, selector)) {
                endCallback('failed to add children to ' + filename);
            }
        });

        output = xmlDoc.write();

        fs.writeFile(filepath, output, function (err) {
            if (err) endCallback(err);

            endCallback();
        });
    });
}

function packageName(config) {
    var mDoc = xmlHelper.readAsETSync(
            path.resolve(config.projectPath, 'AndroidManifest.xml'));

    return mDoc._root.attrib['package'];
}

function srcPath(pluginPath, filename) {
    var prefix = /^src\/android/;

    if (prefix.test(filename)) {
        return path.resolve(pluginPath, filename);
    } else {
        return path.resolve(pluginPath, 'src/android', filename);
    }
}
