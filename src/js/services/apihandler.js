(function (angular, $) {
    'use strict';
    angular.module('FileManagerApp').service('apiHandler', ['$http', '$q', '$window', '$translate', 'snippets', '$firebase', '$firebaseStorage',
        function ($http, $q, $window, $translate, snippets, $firebase, $firebaseStorage) {

            $http.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

            var ApiHandler = function () {
                this.inprocess = false;
                this.asyncSuccess = false;
                this.error = '';
            };

            function getPathObj(path) {
                var pathArr = path.split('/'),
                    fileName = pathArr.pop();
                return {
                    root: pathArr.join('/'),
                    fileName: fileName
                };
            }

            function removeFile(path) {
                var def = $q.defer();
                $firebase.queryRef('files').child($firebase.getValidKey(path) + '/_content').once('value', function (snap) {
                    var val = snap.val();
                    if (val === null) {
                        $firebaseStorage.ref('files' + path + '@selectedSite', {isJs: false}).delete()
                            .then(function () {
                                def.resolve();
                            });
                    } else {
                        var promises = [];
                        angular.forEach(val, function (item) {
                            if (angular.isObject(item)) {
                                promises.push(removeFile(path + '/' + item.name));
                            }
                        });
                        $q.all(promises).then(def.resolve);
                    }
                });
                return def.promise;
            }

            function removePath(path) {
                var def = $q.defer(),
                    pathObj = getPathObj(path),
                    promises = [];
                removeFile(path).then(function () {
                    promises[0] = $firebase.queryRef('files').child($firebase.getValidKey(path)).set(null);
                    promises[1] = $firebase.queryRef('files').child($firebase.getValidKey(pathObj.root) + '/_content/' + $firebase.getValidKey(pathObj.fileName)).set(null);
                    $q.all(promises).then(def.resolve);
                });
                return def.promise;
            }

            ApiHandler.prototype.deferredHandler = function (data, deferred, code, defaultMsg) {
                if (!data || typeof data !== 'object') {
                    this.error = 'Error %s - Bridge response error, please check the API docs or this ajax response.'.replace('%s', code);
                }
                if (code == 404) {
                    this.error = 'Error 404 - Backend bridge is not working, please check the ajax response.';
                }
                if (data.result && data.result.error) {
                    this.error = data.result.error;
                }
                if (!this.error && data.error) {
                    this.error = data.error.message;
                }
                if (!this.error && defaultMsg) {
                    this.error = defaultMsg;
                }
                if (this.error) {
                    return deferred.reject(data);
                }

                return deferred.resolve(data);
            };

            ApiHandler.prototype.list = function (apiUrl, path, customDeferredHandler) {
                var self = this;
                var dfHandler = customDeferredHandler || self.deferredHandler;
                var deferred = $q.defer();
                // var data = {
                //     action: 'list',
                //     path: path
                // };

                self.inprocess = true;
                self.error = '';
                var validPath = $firebase.getValidKey(path);


                $firebase.queryRef('files').child(validPath + '/_content').once('value', function (snap) {
                    var val = snap.val(),
                        data = {result: []};
                    angular.forEach(val, function (value) {
                        if (angular.isObject(value)) data.result.push(value);
                    });

                    dfHandler(data, deferred, 200);
                    self.inprocess = false;
                }, function () {
                    dfHandler({}, deferred, 404);
                });
                return deferred.promise;
            };

            function moveFile(type,apiUrl, items, path, singleFilename){
                var self = this,
                    _path = path==='/'? '/':path+'/',
                    validPath=$firebase.getValidKey(_path),
                    deferred = $q.defer(),
                    promises=[],
                    data = {};


                self.inprocess = true;
                self.error = '';
                angular.forEach(items,function(item){
                    var itemPathArr = item.split('/'),
                        fileName = singleFilename||itemPathArr.pop(),

                        promise = $firebaseStorage.copy('files'+item+'@selectedSite', 'files'+_path+(singleFilename||fileName)+'@selectedSite',type==='move', function(meta){
                            data[$firebase.getValidKey(fileName)] = {
                                rights: 'drwxr-xr-x',
                                size: meta.size,
                                date: (new Date(meta.timeCreated)).getTime(),
                                name: fileName,
                                type: 'file'
                            };
                        });
                    if(type==='move'){
                        var srcPath = itemPathArr.join('/'),
                            _srcPath = srcPath===''? '/':srcPath+'/';
                        promise.then(function(){
                            $firebase.queryRef('files').child(_srcPath+'_content').child($firebase.getValidKey(fileName)).remove();
                        });
                    }
                    promises.push(promise);
                });
                $q.all(promises).then(function(){
                    $firebase.queryRef('files').child(validPath+'_content').update(data);
                    self.deferredHandler({
                        action: type,
                        items: items,
                        newPath: path
                    }, deferred, 200);
                    self.inprocess = false;
                });
                return deferred.promise;
            }

            ApiHandler.prototype.copy = function (apiUrl, items, path, singleFilename) {
                return moveFile.apply(this, ['copy',apiUrl, items, path, singleFilename]);
                // var self = this,
                //     _path = path==='/'? '/':path+'/',
                //     validPath=$firebase.getValidKey(_path),
                //     deferred = $q.defer(),
                //     promises=[],
                //     data = {};
                //
                //
                // self.inprocess = true;
                // self.error = '';
                // angular.forEach(items,function(item){
                //     var itemPathArr = item.split('/'),
                //         fileName = singleFilename||itemPathArr[itemPathArr.length-1],
                //
                //         promise = $firebaseStorage.copy('files'+item+'@selectedSite', 'files'+_path+(singleFilename||fileName)+'@selectedSite',false, function(meta){
                //             data[$firebase.getValidKey(fileName)] = {
                //                 rights: 'drwxr-xr-x',
                //                 size: meta.size,
                //                 date: (new Date(meta.timeCreated)).getTime(),
                //                 name: fileName,
                //                 type: 'file'
                //             };
                //         });
                //
                //     promises.push(promise);
                // });
                // $q.all(promises).then(function(){
                //     $firebase.ref('files'+validPath+'_content@selectedSite').update(data);
                //     self.deferredHandler({
                //         action: 'copy',
                //         items: items,
                //         newPath: path
                //     }, deferred, 200);
                //     self.inprocess = false;
                // });
                // return deferred.promise;
            };

            ApiHandler.prototype.move = function (apiUrl, items, path) {
                return moveFile.apply(this, ['move',apiUrl, items, path]);
                //
                // var self = this;
                // var deferred = $q.defer();
                // var data = {
                //     action: 'move',
                //     items: items,
                //     newPath: path
                // };
                // self.inprocess = true;
                // self.error = '';
                // $http.post(apiUrl, data).success(function (data, code) {
                //     self.deferredHandler(data, deferred, code);
                // }).error(function (data, code) {
                //     self.deferredHandler(data, deferred, code, $translate.instant('error_moving'));
                // })['finally'](function () {
                //     self.inprocess = false;
                // });
                // return deferred.promise;
            };

            ApiHandler.prototype.remove = function (apiUrl, items) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'remove',
                    items: items
                };

                self.inprocess = true;
                self.error = '';
                var promises = [];

                angular.forEach(items, function (path) {
                    promises.push(removePath(path));
                });
                $q.all(promises).then(function () {
                    self.deferredHandler(data, deferred, 200);
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.upload = function (apiUrl, destination, files) {
                var self = this;
                var deferred = $q.defer();
                self.inprocess = true;
                self.progress = 0;
                self.error = '';

                var data = {},
                    validDest = $firebase.getValidKey(destination);

                if (files && files.length) {
                    for (var i = 0; i < files.length; i++) {
                        $firebaseStorage.ref('files' + destination + '/' + files[i].name + '@selectedSite', {isJs: false}).put(files[i]);
                        data[$firebase.getValidKey(files[i].name)] = {
                            rights: 'drwxr-xr-x',
                            size: files[i].size,
                            date: files[i].lastModified,
                            name: files[i].name,
                            type: 'file'
                        };
                    }
                    $firebase.queryRef('files').child(validDest + '/_content').update(data)
                        .then(function () {
                            var res = {
                                result: {
                                    error: null,
                                    success: true
                                }
                            };
                            self.deferredHandler(res, deferred, 200);

                            self.inprocess = false;
                            self.progress = 0;
                            self.progress = Math.min(100, parseInt(100.0)) - 1;
                        });
                }

                return deferred.promise;
            };

            ApiHandler.prototype.getContent = function (apiUrl, itemPath) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'getContent',
                    item: itemPath
                };

                self.inprocess = true;
                self.error = '';
                $http.post(apiUrl, data).success(function (data, code) {
                    self.deferredHandler(data, deferred, code);
                }).error(function (data, code) {
                    self.deferredHandler(data, deferred, code, $translate.instant('error_getting_content'));
                })['finally'](function () {
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.edit = function (apiUrl, itemPath, content) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'edit',
                    item: itemPath,
                    content: content
                };

                self.inprocess = true;
                self.error = '';

                $http.post(apiUrl, data).success(function (data, code) {
                    self.deferredHandler(data, deferred, code);
                }).error(function (data, code) {
                    self.deferredHandler(data, deferred, code, $translate.instant('error_modifying'));
                })['finally'](function () {
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.rename = function (apiUrl, itemPath, newPath) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'rename',
                    item: itemPath,
                    newItemPath: newPath
                };
                self.inprocess = true;
                self.error = '';
                $http.post(apiUrl, data).success(function (data, code) {
                    self.deferredHandler(data, deferred, code);
                }).error(function (data, code) {
                    self.deferredHandler(data, deferred, code, $translate.instant('error_renaming'));
                })['finally'](function () {
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.getUrl = function (apiUrl, path) {
                return $firebaseStorage.ref('files' + path + '@selectedSite', {isJs: false}).getDownloadURL();
            };

            ApiHandler.prototype.download = function (apiUrl, itemPath, toFilename) {
                var self = this;
                // var url = this.getUrl(apiUrl, itemPath);

                var deferred = $q.defer();
                self.inprocess = true;
                $firebaseStorage.ref('files' + itemPath + '@selectedSite', {isJs: false})
                    .getMetadata()
                    .then(function (meta) {
                        var url = $firebaseStorage.getSingleDownloadUrl(meta.downloadURLs);
                        // snippets.toDataUrl(url, function(base64Img) {
                        //     console.log(base64Img);
                        // });
                        // if (!downloadByAjax || forceNewWindow || !$window.saveAs) {
                        //     snippets.downloadURI(url, toFilename);
                        //     // !$window.saveAs && $window.console.log('Your browser dont support ajax download, downloading by default');
                        //     // return !!$window.open(url, '_blank', '');
                        //     return;
                        // }

                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', url, true);

                        xhr.responseType = 'arraybuffer';

                        xhr.onload = function () {
                            if (this.status == 200) {
                                snippets.saveData(xhr.response, toFilename, meta.contentType);
                                self.inprocess = false;
                            }
                            // self.deferredHandler(xhr.response, deferred, code);
                        };
                        xhr.addEventListener('error', function () {
                            self.deferredHandler('error', deferred, xhr.status, $translate.instant('error_downloading'));
                            snippets.downloadURI(url, toFilename);
                            self.inprocess = false;
                        });
                        xhr.send();


                        // $http.get(url).then(function (res) {
                        //     // var bin = new $window.Blob([data]);
                        //     deferred.resolve(res.data);
                        //     console.log(meta);
                        //     snippets.saveData(res.data,toFilename, meta.contentType);
                        //     // $window.saveAs(bin, toFilename);
                        // },function (data, code) {
                        //     snippets.downloadURI(url, toFilename);
                        //     self.deferredHandler(data, deferred, code, $translate.instant('error_downloading'));
                        // })['finally'](function () {
                        //     self.inprocess = false;
                        // });
                    });

                return deferred.promise;
            };

            ApiHandler.prototype.downloadMultiple = function (apiUrl, items, toFilename, downloadByAjax, forceNewWindow) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'downloadMultiple',
                    items: items,
                    toFilename: toFilename
                };
                var url = [apiUrl, $.param(data)].join('?');

                if (!downloadByAjax || forceNewWindow || !$window.saveAs) {
                    !$window.saveAs && $window.console.log('Your browser dont support ajax download, downloading by default');
                    return !!$window.open(url, '_blank', '');
                }

                self.inprocess = true;
                $http.get(apiUrl).success(function (data) {
                    var bin = new $window.Blob([data]);
                    deferred.resolve(data);
                    $window.saveAs(bin, toFilename);
                }).error(function (data, code) {
                    self.deferredHandler(data, deferred, code, $translate.instant('error_downloading'));
                })['finally'](function () {
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.compress = function (apiUrl, items, compressedFilename, path) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'compress',
                    items: items,
                    destination: path,
                    compressedFilename: compressedFilename
                };

                self.inprocess = true;
                self.error = '';
                $http.post(apiUrl, data).success(function (data, code) {
                    self.deferredHandler(data, deferred, code);
                }).error(function (data, code) {
                    self.deferredHandler(data, deferred, code, $translate.instant('error_compressing'));
                })['finally'](function () {
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.extract = function (apiUrl, item, folderName, path) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'extract',
                    item: item,
                    destination: path,
                    folderName: folderName
                };

                self.inprocess = true;
                self.error = '';
                $http.post(apiUrl, data).success(function (data, code) {
                    self.deferredHandler(data, deferred, code);
                }).error(function (data, code) {
                    self.deferredHandler(data, deferred, code, $translate.instant('error_extracting'));
                })['finally'](function () {
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.changePermissions = function (apiUrl, items, permsOctal, permsCode, recursive) {
                var self = this;
                var deferred = $q.defer();
                var data = {
                    action: 'changePermissions',
                    items: items,
                    perms: permsOctal,
                    permsCode: permsCode,
                    recursive: !!recursive
                };

                self.inprocess = true;
                self.error = '';
                $http.post(apiUrl, data).success(function (data, code) {
                    self.deferredHandler(data, deferred, code);
                }).error(function (data, code) {
                    self.deferredHandler(data, deferred, code, $translate.instant('error_changing_perms'));
                })['finally'](function () {
                    self.inprocess = false;
                });
                return deferred.promise;
            };

            ApiHandler.prototype.createFolder = function (apiUrl, path) {
                var self = this;
                var deferred = $q.defer(),
                    pathObj = getPathObj(path),
                    rootPath = $firebase.getValidKey(pathObj.root),
                    dirName = pathObj.fileName;
                $firebase.queryRef('files').child($firebase.getValidKey(path)).update({
                    '_content': {'__created': true}
                });

                $firebase.queryRef('files').child(rootPath + '/_content/' + $firebase.getValidKey(dirName)).update({
                    rights: 'drwxr-xr-x',
                    size: 0,
                    date: (new Date()).getTime(),
                    name: dirName,
                    type: 'dir'
                })
                    .then(function () {
                        var res = {
                            result: {
                                error: null,
                                success: true
                            }
                        };
                        self.deferredHandler(res, deferred, 200);

                        self.inprocess = false;
                        self.progress = 0;
                        self.progress = Math.min(100, parseInt(100.0)) - 1;
                    });

                self.inprocess = true;
                self.error = '';
                // $http.post(apiUrl, data).success(function (data, code) {
                //     self.deferredHandler(data, deferred, code);
                // }).error(function (data, code) {
                //     self.deferredHandler(data, deferred, code, $translate.instant('error_creating_folder'));
                // })['finally'](function () {
                //     self.inprocess = false;
                // });

                return deferred.promise;
            };

            return ApiHandler;

        }]);
})(angular, jQuery);