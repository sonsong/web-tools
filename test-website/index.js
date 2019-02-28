const Koa = require('koa'),
    router     = require('koa-router')(),
    render     = require('koa-art-template'),
    path       = require('path'),
    bodyParser = require('koa-bodyparser'),
    request    = require('request'),
    iconv = require('iconv-lite'),
    cheerio = require('cheerio'),
    static_server = require('koa-static');
    
const app = new Koa();

/**
 *  用PM2 管理多个node项目收，pm2.json 中 name 得名字不能相同，
 * PM2 会启动所有项目 
 */

//注册art-template模板解析器
render(app, {
    root   : path.join(__dirname, 'views'),
    extname: '.html',
    debug  : process.env.NODE_ENV !== 'production'
});

//处理post请求参数 formLimit 处理表单的数据最大限制  处理json数据的最大限制
app.use(bodyParser({formLimit: '50mb', jsonLimit: '50mb'}));

//进入index页面
router.get('/', async(ctx) =>{
    ctx.redirect('/index');
})
router.get('/index', async(ctx) =>{
    ctx.render('index.html');
})

//处理数据
router.post('/postWebsites', async(ctx) =>{
    let {websites} = ctx.request.body;

    let results = [];
    //处理数据
    for (const key in websites) {
        
        let item = websites[key];
        console.log(`正在检测${item.website}`);

        if(item.website.indexOf('http') === -1 && item.website.indexOf('https') === -1){
            item.website = `http://${item.website}`;
        }

        results.push(
            new Promise((resolve, reject) =>{
                let result = {};

                 // 发送请求检测是否能访问成功
                request.get({
                        url: item.website, 
                        gzip: true,
                        encoding:null
                    }, function (err, res, body) {
                    console.log(`${item.website}检测完毕`);

                    //访问不通 err !== null
                    if(err !== null){
                        result = {code: -1, mess: "无法访问", item};
                    }else if(err === null && body.length !== 0){
                        // 获取网页得编码方式
                        let contentType = res.headers['content-type'];
                        let index = contentType.indexOf('charset=');
                        let encode = 'utf-8';
                        
                        // 响应头中返回了编码方式
                        if(index !== -1){
                            encode = contentType.substring(index + 'charset='.length);
                        }else{
                            // 没有返回，用meta标签中编码
                            //生成DOM结构
                            const $ =cheerio.load(body);

                            let charset = $('meta').attr("charset");
                            //再次确认编码
                            if( charset !== undefined){
                                encode = charset;
                            }else{
                                let content = $('meta').attr("content");
                                if(content !== undefined){
                                    let position = content.trim().indexOf("charset=");
                                    if(position === -1){
                                        encode = "gb2312";
                                    }else{
                                        encode = content.substring(position + "charset=".length);
                                    }
                                }
                            }
                        }
                        // 解决乱码
                        let buf =  iconv.decode(body, encode);

                        let _result = {code: 1, mess: "访问成功", item};

                        //校验网站是否被篡改
                        /* let reg       = new RegExp('\<title[^\>]*\>\s*(?<Title>.*?)\s*\</title\>','ig');
                        let regResult = reg.exec(body);

                        let title = regResult[1];*/
                        let start = buf.indexOf('<title>');
                        let end   = buf.indexOf('</title>');
                        let title = buf.substring(start + '<title>'.length, end);

                        if(item.name.trim() !== title.trim()){
                            _result.mess += `,但访问的网站标题跟提供的不一致, 访问的网址的名称是<span style="color:red">${title}</span>`;
                        }

                        result = _result;
                    }

                    resolve(result);
                })  
            })
        );
    }

    let datas = [];
    await Promise.all(results).then(res =>{
        datas = res;
    })

    ctx.body = {datas};
})

//处理静态文件
app.use(static_server(path.join(__dirname, 'static')));

app.use(router.routes()).use(router.allowedMethods());

app.listen(9900);
console.log('server is running at 9900 port...');