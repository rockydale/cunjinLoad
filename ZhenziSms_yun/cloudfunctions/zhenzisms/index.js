// 云函数入口文件
const cloud = require('wx-server-sdk')
const TcbRouter = require('tcb-router')
const rq = require('request')
const baseUrl = 'https://smsdeveloper.zhenzikj.com'
const appId = '你的appId'
const appSecret = '你的appSecret'

cloud.init()
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const app = new TcbRouter({ event });
  
  app.router('send', async (ctx) => {
    var messageId = typeof (event.messageId) == "undefined" ? '' : event.messageId;
    var clientIp = typeof (event.clientIp) == "undefined" ? '' : event.clientIp;
    var templateParams = event.templateParams;
    if(typeof (templateParams) != "undefined"){
      templateParams = JSON.stringify(templateParams);
    }
    ctx.body = new Promise(resolve => {
      rq({
        url: baseUrl + '/sms/v2/send.html',
        method: "POST",
        json: true,
        form: {
          apiUrl: event.apiUrl,
          appId: appId,
          appSecret: appSecret,
          templateId: event.templateId,
          templateParams: templateParams,
          number: event.number,
          messageId: messageId,
          clientIp: clientIp
        }
      }, function (error, response, body) {
        resolve(body)
      });
      // setTimeout(() => {
      //   resolve('male');
      // }, 500);
    });
  });
  app.router('balance', async (ctx) => {
    ctx.body = new Promise(resolve => {
      rq({
        url: baseUrl + '/sms/balance.html',
        method: "POST",
        json: true,
        form: {
          apiUrl: event.apiUrl,
          appId: appId,
          appSecret: appSecret
        }
      }, function (error, response, body) {
        resolve(body)
      });
    });
  });
  app.router('findSmsByMessageId', async (ctx) => {
    ctx.body = new Promise(resolve => {
      rq({
        url: baseUrl + '/sms/findSmsByMessageId.html',
        method: "POST",
        json: true,
        form: {
          apiUrl: event.apiUrl,
          appId: appId,
          appSecret: appSecret,
          messageId: event.messageId
        }
      }, function (error, response, body) {
        resolve(body)
      });
    });
  });
  app.router('createCode', async (ctx) => {
    let { OPENID} = cloud.getWXContext()
    const intervalTime = event.intervalTime;//60 * 1000;//两条短信间隔时间(毫秒)，<=0 时无间隔
    var dbResult = await db.collection('sms-record').where({
      openid: OPENID
    }).orderBy('createTime', 'desc').limit(1).get();
    dbResult = dbResult.data;
    if (dbResult.length != 0 && intervalTime > 0){
      var record = dbResult[0];
      if (Number(new Date()) - Number(record.createTime) < intervalTime){
        ctx.body = { code: 'intervalError', data:'未到达最小间隔，请过一会在获取吧'};
        return ;
      }
    }
    //生成验证码
    var captcha = '';
    for (var i = 0; i < event.length; i++) {
      //设置随机数范围,这设置为0 ~ 9
      captcha += Math.floor(Math.random() * 9);
    }
    var currentDate = new Date();
    var expire = event.seconds * 1000;
    ctx.body = new Promise(resolve => {
      db.collection('sms-record').add({
        data: {
          openid: OPENID,
          number: event.number,
          code: captcha,
          expire: expire,
          createTime: currentDate,
          status: 'normal'
        }
      }).then(res => {
        resolve({ code: 'success', data: captcha });
      })
    });
  });
  app.router('validateCode', async (ctx) => {
    let { OPENID } = cloud.getWXContext()
    var dbResult = await db.collection('sms-record').where({
      openid: OPENID
    }).orderBy('createTime', 'desc').limit(1).get();
    data = dbResult.data;
    if (data.length == 0) {
      ctx.body = { code: 'empty', data: '未生成验证码!' };
      return ;
    }
    var record = data[0];
    if (record.status == 'used') {
      ctx.body = { code: 'code_used', data: '验证码已被使用!' };
      return;
    }
    if (record.number != event.number) {
      ctx.body = { code: 'number_error', data: '手机号码错误!' };
      return;
    }

    if (Number(new Date()) - Number(record.createTime) > record.expire){
      ctx.body = { code: 'code_expired', data: '验证码已过期!' };
      return;
    }
    if (record.code != event.code){
      ctx.body = { code: 'code_error', data: '验证码不一致!' };
      return;
    }
    ctx.body = new Promise(resolve => {
      db.collection('sms-record').where({
        _id: record._id
      }).update({
        data: {
          status: 'used'
        }
      }).then(res => {
        resolve({ code: 'success', data: '' });
      })
    });
  });
  return app.serve();
}