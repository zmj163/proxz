var http=require('http'),
    https=require('https'),
    path=require('path'),
    fs=require('fs'),
    zlib=require('zlib'),
    qs=require('querystring'),
    util=require('util'),
    tracer=require('tracer'),
    urlparse=require('url').parse;

var logger=tracer.console({
    format:'{{timestamp}} {{message}} [{{title}}]({{file}}:{{line}})',
    dateformat:'yyyy-mm-dd HH:MM:ss',
    transport : function(data) { 
        console.log(data.output);
        fs.open(__dirname+'/../proxy.log', 'a', 0666, function(e, id) {
            fs.write(id, data.output+"\n", null, 'utf-8', function() {
                fs.close(id, function() { });
            });
        });
    }
});
//string helper method---------
String.prototype.title= function(){
    return this.replace( /(^|\s|-)([a-z])/g , function(m,p1,p2){
        return p1+p2.toUpperCase();
    } );
};
String.prototype.format= function(dic){
    var s=this;
    for(var k in dic){
        str='${'+k+'}';
        i=s.indexOf(str);
        while(i>=0){
            s=s.replace(str,dic[k]);
            i=s.indexOf(str);
        }
    }
    return s;
};
String.prototype.strip=function(){
    return this.replace(/^\s+|\s+$/g,'');
}
function capitalize(headers){
    var _headers={};
    for(var k in headers){
        _headers[k.title()]=headers[k];
    }
    return _headers;
}
//querystring,quote ! to %21
qs.__escape=qs.escape;
qs.escape=function(str){
    return this.__escape(str).replace('!','%21');
};


var _aria2={
    url:'http://localhost:6800/jsonrpc',
    //url='http://localhost:'+process.env.PORT_RPC+'/jsonrpc';
    addUri:function(downloadURL,options,callback){
        if(options instanceof Function){
            callback=options;options=null;
        }
        var params=[downloadURL];
        if(options)params.push(options);
        jsonRPC(this.url,'aria2.addUri',params,callback);
    },

};

function jsonRPC(endPoint,method,params,callback){
    if(typeof(method) !== 'string') throw("Invalid method supplied for jsonRPC request")
    //TODO:check params valid?
    var payload={'jsonrpc':'2.0','id':1,'method':method};
    if(params)payload['params']=params;
    var url=urlparse(endPoint);
    var buf=new Buffer(JSON.stringify(payload));
    var options={
        hostname:url['hostname'],
        port:url['port']||80,
        path:url['path'],
        method:'POST',
        headers:{
            'Content-Length':buf.length,'Connection':'close',
            'Content-Type':'application/json'
        }
    };

    var req = http.request(options, function(res) {
        res.on('data', function (chunk) {
            var data=chunk.toString();
            try{
                var js=JSON.parse(data);
                callback(null,js);
            }catch(err){
                callback(err,null);
            }
            req.abort();
        });
    });

    req.on('error', function(err) {
        logger.error('[jsonRPC]' + err.message);
        callback(err,null);
    });
    req.end(buf);
}
//caesar
function mask(buf){
    var n=13;
    var skip=4;
    for(var i=skip;i<buf.length;i++){
        val=buf[i];
        if (val>=0x41 && val<=0x5a){//A-Z
            val=0x41+(val-0x41+n)%26;
        }else if (val >=0x61 && val <=0x7a){//a-z
            val=0x61+(val-0x61+n)%26;
        }
        buf[i]=val;
    }
}
function mypass(chunk){
    if(typeof(chunk)=='string')chunk=new Buffer(chunk);
    if(!Buffer.isBuffer(chunk)){logger.error('[mypass]%s is not Buffer',chunk);return;}
    var up   =[0x71,0x77,0x65,0x72,0x74,0x79,0x75];
    var down =[0x7a,0x78,0x63,0x76,0x62,0x6e,0x6d];
    for(var i=0;i<chunk.length;i++){
        var c=chunk[i];
        var j=up.indexOf(c);
        if(j>=0){
            c=down[j];
        }else{
            j=down.indexOf(c);
            if(j>=0)c=up[j];
        }
        chunk[i]=c;
    }
    return chunk.toString();
}
/**
function xor(buf){
    for (var i = 0 ; i < buf.length ; i++) { buf[i] = buf[i]^0x88 }
}
function fileExists(filepath){
    filepath=path.normalize(filepath);
    if(!fs.existsSync(filepath)) throw new Error('file not exists: '+filepath);
    var stat=fs.statSync(filepath);
    if(!stat.isFile())throw new Error('not a File: '+filepath);
    return true;
}
*/

var toughCookie=require('tough-cookie'),
    Cookie=toughCookie.Cookie,
    cookiejar=new toughCookie.CookieJar();

var Iconv=null;
try{Iconv=require('iconv').Iconv;}catch(err){}
var _Referer='';
function getOptions(method,requestURL,headers,callback){
    var _headers={
        'User-Agent':'Mozilla/5.0 (Windows NT 5.1; rv:16.0) Gecko/20100101 Firefox/16.0',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        //'Referer':'http://f.xunlei.com/channel',
        'Accept-Encoding':'gzip, deflate'
    };
    if(method=='POST')_headers['Content-Type']='application/x-www-form-urlencoded';
    if(_Referer){_headers['Referer']=_Referer;}
    if(headers){for(var k in headers){_headers[k]=headers[k];}}
    url=urlparse(requestURL);
    var options={
        hostname:url.hostname,
        method:method,
        path:url.path,
        headers:_headers
    };
    if(url.port)options['port']=url.port;
    //console.dir(url);
    cookiejar.getCookies(url,function(err,cookies){
        if(cookies.length){
        var _cookies=cookies.map(function(e){return e.cookieString();}).join('; ');
        if(_headers['Cookie']){
            _cookies=_headers['Cookie']+'; '+_cookies;
        }
        _headers['Cookie']=_cookies;
        //options['cookie']={};
        //cookies.forEach(function(e){
            //options['cookie'][e.key]=e.value;
        //});
        }
        callback(options);
    });
}
function request(method,url,payload,headers,callback){
    if(headers instanceof Function){
        callback=headers;headers=null;
    }
    //var method=payload?'POST':'GET';
    getOptions(method,url,headers,function(options){
    if(payload){
        options.headers['Content-Length']=payload.length;
    }else if (method=='POST'){
        options.headers['Content-Length']=0;
    }
    var conn=url.indexOf('https')==0?https:http;
    var req=conn.request(options,function(res){
        var mark=url.indexOf('?');
        if(mark>0)_Referer=url.substring(0,mark);else _Referer=url;
        var setcookies=res.headers['set-cookie'];
        res.cookie={};
        if(setcookies){
            var _cb=function(err,cookie){};
            if (setcookies instanceof Array){
                setcookies.forEach(function(e){
                    var _cookie=Cookie.parse(e);
                    cookiejar.setCookie(_cookie,url,_cb);
                    res.cookie[_cookie.key]=_cookie.value;
                });
            }else{
                var _cookie=Cookie.parse(setcookies);
                cookiejar.setCookie(_cookie,url,_cb);
                res.cookie[_cookie.key]=_cookie.value;
            }
        }
        //var ins=res;
        var unzip;
        switch(res.headers['content-encoding']){
            case 'gzip':
                //ins=zlib.createGunzip();res.pipe(ins);
                unzip=zlib.gunzip;
                break;
            case 'deflate':
                //ins=zlib.createInflate();res.pipe(ins);
                unzip=zlib.inflate;
                break;
        }
        function decode(buffer,charset){
            var data;
            if(Iconv&&charset&&charset!='utf-8'){
                try{
                    var iconv=new Iconv(charset,'UTF-8');
                    data=iconv.convert(buffer).toString();
                }catch(err){
                    logger.error(err);
                    data=buffer.toString('binary');
                }
            }else if(charset=='utf-8'){
                data=buffer.toString();
            }else{
                data=buffer.toString('binary');
            }
            return data;
        }
        //res.data='';
        var caches=[],buffLen=0,end=false;
        res.on('data',function(chunk){
            caches.push(chunk);
            buffLen+=chunk.length;
        });
        res.on('end',function(){
            end=true;
            if(!callback)return;
            var buffer=Buffer.concat(caches,buffLen);
            var charset=res.headers['content-type'];
            //res.setEncoding('utf-8');
            //text/html;charset=gbk
            if(charset&&charset.indexOf('charset')>=0){
                var _i=charset.indexOf('=');
                charset=charset.substring(_i+1).trim().toLowerCase();
            }else{
                charset=null;
            }
            if(unzip){
                unzip(buffer,function(err,buffer){
                    if(err)return callback(err,res);
                    res.data=decode(buffer,charset);
                    callback(null,res);
                });
            }else{
                res.data=decode(buffer,charset);
                callback(null,res);
            }
        });

        res.on('close',function(){
            if(!end && callback)callback(new Error('transfer terminated by server unexpectedly'),null);
        });
    });
    //req.setTimeout(30000,function(){
        //proxy_request.abort();
        //response.end();
        //util.error('[timeout:30s]'+request.url);
    //});
    req.on('error',function(err){
        callback(err,null);
    });
    req.end(payload);
    });
}

var _http={
    get:function(url,headers,callback){
        request('GET',url,null,headers,callback);
    },
    post:function(url,payload,headers,callback){
        request('POST',url,payload,headers,callback);
    }
};

// ini reader 
var _iniReader = require('./inireader.js');
// initialize
var inifile=path.resolve(path.join(__dirname,'../y2proxy.ini'));
var _parser = new _iniReader.IniReader(inifile);
var _parser_write=_parser.write;
var _parser_load=_parser.load;
_parser.write=function(){
    console.log('%s - saving ini: %s',new Date(),_parser.file);
    return _parser_write.apply(_parser,arguments);
    //return _parser.write.apply(this,arguments);
};
_parser.load=function(){
    if(!fs.existsSync(_parser.file)){logger.error('[ini]load failed:%s',_parser.file);return;}
    logger.log('[INI]loaded: %s',_parser.file);
    return _parser_load.apply(_parser,arguments);
    //return _parser.write.apply(this,arguments);
};
_parser.toText=function(){
    var values=this.values;
    var rs='';

    var show=true;
    show=false;
    if(show){
    var _9gal=values['9gal'];
    var name=_9gal['user']||'';
    var pass=_9gal['pass']||'';
    rs+='\n;bbs.9gal.com\n';
    rs+=';说明：广告/KFB\n';
    rs+='[9gal]\n';
    rs+=util.format('username=%s\npassword=%s\n',name,pass);
    }

    var _xunlei=values['xunlei'];
    var name=_xunlei['user']||'';
    var pass=_xunlei['pass']||'';
    rs+='\n;f.xunlei.com\n';
    rs+=';说明:迅雷方舟登录帐号，用于上传服务器文件到方舟\n';
    rs+='[xunlei]\n';
    rs+=util.format('username=%s\npassword=%s\n',name,pass);
    
    var _vdisk=values['vdisk'];
    var name=_vdisk['user']||'';
    var pass=_vdisk['pass']||'';
    rs+='\n;vdisk.weibo.com\n';
    rs+=';说明:上传文件至新浪微盘\n';
    rs+='[vdisk]\n';
    rs+=util.format('username=%s\npassword=%s\n',name,pass);
    return rs;
};
function mergeIni(content){
    var filename=process.env.PORT_PROXY?'/tmp/utility.tmp.ini':path.join(__dirname,'utility.tmp.ini');
    fs.writeFileSync(filename,content,'utf-8');
    var ini = new _iniReader.IniReader(filename);
    ini.on('fileParse',function(){
    var values=ini.values;
    /*
     *var _115=values['115'];
     *var cfg=_parser.param('115');
     *for(var name in _115){
     *    var pass=_115[name];
     *    var info=JSON.parse(cfg[name])||{time:Date.now()};
     *    info.pass=pass;
     *    cfg[name]=JSON.stringify(info);
     *}
     */

    var _9gal=values['9gal'];
    var cfg=_parser.param('9gal');
    if(_9gal && cfg){
        var user=_9gal['username'];
        var pass=_9gal['password'];
        if(user&&pass){cfg['user']=user;cfg['pass']=pass;}
    }
    var _xunlei=values['xunlei'];
    var cfg=_parser.param('xunlei');
    if(_xunlei && cfg){
        var user=_xunlei['username'];
        var pass=_xunlei['password'];
        if(user&&pass){cfg['user']=user;cfg['pass']=pass;}
    }

    var _vdisk=values['vdisk'];
    var cfg=_parser.param('vdisk');
    if(_vdisk && cfg){
        var user=_vdisk['username'];
        var pass=_vdisk['password'];
        if(user&&pass){cfg['user']=user;cfg['pass']=pass;}
    }
    });
    ini.load();
}
/*
 *fs.exists(inifile,function(exists){
 *    if(exists){ _parser.load(); }
 *});
 */

function nullcb(){}
var _Cookie={
    file:path.join(__dirname,'cookies.json'),
    get:function(url,options,callback){
        cookiejar.getCookies(url,options,callback);
    },
    trace:function(){
        logger.log(util.inspect(cookiejar.store.idx));
    },
    remove:function(domain){
        //cookiejar.store.removeCookies(domain,null,nullcb);
        delete cookiejar.store.idx[domain];
    },
    save:function(file){
        var cookies=cookiejar.store.idx;
        /*
         *for(var domain in cookies){
         *    for (var path in cookies[domain]){
         *        for(var key in cookies[domain][path]){
         *            var c=cookies[domain][path][key];
         *            cookies[domain][path][key]=new Buffer(JSON.stringify(c)).toString('base64');
         *        }
         *    }
         *}
         */
        if(!file)file=this.file;
        fs.writeFileSync(file,JSON.stringify(cookies,null,2));
        console.log('%s - saved cookies: %s',new Date(),file);
    },
    load:function(file){
        if(!file)file=this.file;
        if(!fs.existsSync(file)){logger.error('[Cookie]load failed:%s',file);return;}
        this.file=file;
        fs.readFile(file,'utf-8',function(err,data){
            try{
            var cookies=JSON.parse(data);
            for(var domain in cookies){
                for (var path in cookies[domain]){
                    for(var key in cookies[domain][path]){
                        var c=cookies[domain][path][key];
                        cookies[domain][path][key]=Cookie.fromJSON(JSON.stringify(c));
                        //cookies[domain][path][key]=Cookie.fromJSON(new Buffer(c,'base64').toString());
                        //=Cookie.parse(cookies[domain][path][key]);
                    }
                }
            }
            cookiejar.store.idx=cookies;
            logger.info('[Cookie]loaded: %s',file);
            }catch(err){
            logger.warn('[Cookie]load failed: %s',file);
            logger.error(err);
            }
        });
    },
};
function dateFormat (date, fstr, utc) {
  utc = utc ? 'getUTC' : 'get';
  return fstr.replace (/%[YmdHMS]/g, function (m) {
    switch (m) {
    case '%Y': return date[utc + 'FullYear'] (); // no leading zeros required
    case '%m': m = 1 + date[utc + 'Month'] (); break;
    case '%d': m = date[utc + 'Date'] (); break;
    case '%H': m = date[utc + 'Hours'] (); break;
    case '%M': m = date[utc + 'Minutes'] (); break;
    case '%S': m = date[utc + 'Seconds'] (); break;
    default: return m.slice (1); // unknown code, remove %
    }
    // add leading zero if required
    return ('0' + m).slice (-2);
  });
}
function log(filename,msg){
    var _8hours=1000*60*60*8;
    var dir='d:/downloads/';
    if(process.env.PORT_PROXY){
        dir='/home/dotcloud/data/';
    }
    var prefix=dateFormat (new Date (Date.now()+_8hours), "%Y-%m-%d %H:%M:%S", true);
    fs.appendFile(path.join(dir,filename),prefix+' - '+msg+'\r\n',function(err){if(err)console.error(err);});
}
//exports.Cookie=Cookie;
//exports.cookiejar=cookiejar;

exports.http=_http;
exports.Cookie=_Cookie;
exports.ini=_parser;
exports.mergeIni=mergeIni;

exports.aria2=_aria2;
exports.capitalize=capitalize;
exports.jsonRPC=jsonRPC;
exports.mask=mypass;
exports.logger=logger;
exports.log=log;

if(false){
    console.log(__filename);
    var _8hours=1000*60*60*8;
var s=dateFormat (new Date (Date.now()+_8hours), "%Y-%m-%d %H:%M:%S", true);
logger.log('你好hello,world');
    //exports.Cookie.load();
    /*
     *exports.ini.load();
     *setTimeout(function(){
     *    var s=exports.ini.toText();
     *    console.log(s);
     *    s=s.replace('ssskha201279','xxx');
     *    exports.mergeIni(s);
     *},1000);
     *process.on('exit',function(){
     *    exports.ini.write('yul.ini');
     *});
     */
}
