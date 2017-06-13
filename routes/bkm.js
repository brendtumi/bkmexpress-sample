const express = require('express');
const router = express.Router();
const debug = require('debug')('test:app');
const fs = require("fs");

const Bex = require("bkmexpress");

const privateKey = fs.readFileSync("./client.privatePKCS8.pem").toString(); // "PRIVATE-KEY"
const merchantId = fs.readFileSync("./merchant").toString(); // "YOUR-MERCHANT-ID"

// Kendinize özel end-point url'leri
const urlBase = fs.readFileSync("./urlForInstallments").toString();
const urlForInstallments = urlBase + "/bkm/installments";
const urlForNonce = urlBase + "/bkm/nonce";
// --

// Connection Token'ın Alınabilmesi için Gerekli Konfigürasyonun Yapılması
const config = Bex.BexPayment.startBexPayment(Bex.Environment.SANDBOX, merchantId, privateKey);

router.get('/', function (req, res, next) {
    const merchantService = new Bex.MerchantService(config);
    let amount = Math.round(Math.random()*10000) / 100;

    // Connection Token'ın Alınması
    merchantService.login()
        .then(function (loginResponse) {
            // Ticket Token'ı Üretilmesi
            const ticketResponse = merchantService.oneTimeTicket(loginResponse.Token, amount, urlForInstallments, urlForNonce);
            ticketResponse
                .then(function (response2) {
                    // Ticket Token'ın Ön Yüze İletilmesi
                    res.render('index', {
                        // Client SDK url'ini kendiniz manuel girebilirsiniz
                        // ama bu sekilde de yaparsaniz, her ortam degisiklikligi
                        // yaptiginizda(Sandbox, Production) url'i degistirmenize gerek kalmadan ortam icin dogru url'i verir.
                        baseUrl: config.BexApiConfiguration.BaseJs,
                        ticketId: response2.Token.ShortId,
                        ticketPath: response2.Token.Path,
                        ticketToken: response2.Token.Token
                    });
                })
                .catch(function (err) {
                    debug("merchantService/oneTimeTicket", "ticketResponse", err);
                    next(err);
                });
        })
        .catch(function (err) {
            debug("merchantService/login", "MerchantLoginResponse", err);
            next(err);
        });
});
router.post('/bkm/installments', function (req, res) {
    // Endpoint'in Oluşturulması
    debug("Request from BKM", req.body);

    if (req.body.bin && req.body.totalAmount && req.body.ticketId && req.body.signature) {

        const request = new Bex.InstallmentRequest(req.body.bin, req.body.totalAmount, req.body.ticketId, req.body.signature);
        const response = new Bex.InstallmentsResponse();

        if (Bex.EncryptionUtil.verifyBexSign(request.TicketId, request.Signature)) {

            let amount = Bex.MoneyUtils.toNumber(request.TotalAmount);
            let allInstallmentsForEveryBin = {};

            for (let binAndBank of request.binAndBanks()) {
                let bankCode = binAndBank.BankCode;
                let installmentsForThisBin = [];

                let vposConfig = new Bex.VposConfig();
                // baska bankalar icin vpos hazirlama

                debug("bankCode", bankCode);
                switch (bankCode) {
                    case Bex.Banks.ZIRAATBANK:
                        // Eger istenilen banka icin pos'unuz mevcutsa
                        vposConfig.BankIndicator = Bex.Banks.ZIRAATBANK;
                        vposConfig.VposUserId = "bkmtest";
                        vposConfig.VposPassword = "TEST1691";
                        vposConfig.addExtra("ClientId", "190001691");
                        vposConfig.addExtra("storekey", "TRPS1691");
                        vposConfig.addExtra("orderId", "9073194");
                        vposConfig.ServiceUrl = "http://srvirt01:7200/ziraat";
                        break;
                    case Bex.Banks.ISBANK:
                        // Eger istenilen banka icin pos'unuz mevcutsa
                        vposConfig.BankIndicator = Bex.Banks.ISBANK;
                        vposConfig.VposUserId = "bkmapi";
                        vposConfig.VposPassword = "KUTU8900";
                        vposConfig.addExtra("ClientId", "700655047520");
                        vposConfig.addExtra("storekey", "TEST123456");
                        vposConfig.ServiceUrl = "http://srvirt01:7200/isbank";
                        break;
                    case Bex.Banks.AKBANK:
                    default:
                        // Yoksa varsayılan bankanız
                        vposConfig.BankIndicator = Bex.Banks.AKBANK;
                        vposConfig.VposUserId = "akapi";
                        vposConfig.VposPassword = "TEST1234";
                        vposConfig.addExtra("ClientId", "100111222");
                        vposConfig.addExtra("storekey", "TEST1234");
                        vposConfig.ServiceUrl = "http://srvirt01:7200/akbank";
                        break;
                }

                for (let i = 1; i < 6; i++) {
                    let installment = new Bex.Installment(i.toString(), Bex.MoneyUtils.toTRY(amount / i), Bex.MoneyUtils.toTRY(amount), Bex.EncryptionUtil.encryptWithBex(vposConfig));
                    installmentsForThisBin.push(installment);
                }
                // - end
                allInstallmentsForEveryBin[binAndBank.Bin] = installmentsForThisBin;
            }

            response.Installments = allInstallmentsForEveryBin;
            response.Status = "ok";
            response.Error = "";
            debug("Response", JSON.stringify(response));
            res.json(response);
        }
        else {
            response.Status = "fail";
            response.Error = "signature verification failed";
            debug("Response", JSON.stringify(response));
            res.json(response);
        }
    }
    else {
        const response = new Bex.InstallmentsResponse();
        response.Status = "fail";
        response.Error = "RequestBody fields cannot be null or signature verification failed";
        debug("Response", JSON.stringify(response));
        res.json(response);
    }

});

function checkPayment(nonceRequest) {
    debug("NonceRequest", nonceRequest);
    const merchantNonceResponse = new Bex.MerchantNonceResponse();
    const merchantService = new Bex.MerchantService(config);
    merchantService.login()
        .then(function (loginResponse) {
            if (Bex.EncryptionUtil.verifyBexSign(nonceRequest.TicketId, nonceRequest.Signature)) {
                debug("verifyBexSign", "OK");
                // İşlemin hala geçerliliğinin korunup, korumadığı kontrol edilir.
                // ....
                // basarili nonce cevabı

                merchantNonceResponse.Result = true;
                merchantNonceResponse.Nonce = nonceRequest.Token;
                merchantNonceResponse.Id = nonceRequest.Path;
                merchantNonceResponse.Message = "YOUR-MESSAGE-WILL-BE-STORED-IN-BKM";

                debug("merchantNonceResponse", merchantNonceResponse);

                merchantService.sendNonceResponse(loginResponse.Token, merchantNonceResponse)
                    .then(function (response) {
                        debug("merchantService/sendNonceResponse", "NonceResultResponse", response);
                    })
                    .catch(function (err) {
                        debug("merchantService/sendNonceResponse", "NonceResultResponse", err);
                    });
            }
            else {
                debug("verifyBexSign", "FAIL");
                merchantNonceResponse.Result = false;
                merchantNonceResponse.Nonce = nonceRequest.Token;
                merchantNonceResponse.Id = nonceRequest.Path;
                merchantNonceResponse.Message = "Signature verification failed";
                merchantService.sendNonceResponse(loginResponse.Token, merchantNonceResponse)
                    .then(function (response) {
                        debug("merchantService/sendNonceResponse", "NonceResultResponse", response);
                    })
                    .catch(function (err) {
                        debug("merchantService/sendNonceResponse", "NonceResultResponse", err);
                    });
            }
        })
        .catch(function (err) {
            debug("merchantService/login", "MerchantLoginResponse", err);
        });
}

router.post('/bkm/nonce', function (req, res) {
    debug("nonce", {method: req.method, query: req.query, params: req.params, body: req.body});
    const response = new Bex.NonceReceivedResponse();
    if (req.body.id && req.body.path && req.body.issuer && req.body.approver && req.body.token && req.body.signature && req.body.reply) {
        // asenkron işlemden önce Nonce isteğinin başarılı olarak alındığı iletilmelidir.
        response.Result = "ok";
        response.Data = "ok";
        res.json(response);
        debug("Nonce Response", JSON.stringify(response));

        const request = new Bex.NonceRequest(req.body.id, req.body.path, req.body.issuer, req.body.approver, req.body.token, req.body.signature, req.body.reply);
        // asenkron bir işlem ile işlem kontrolleri yapılmalıdır.
        checkPayment(request);
    }
    else {
        response.Result = "fail";
        response.Data = "fail";
        res.json(response);
    }
});
router.get('/result/:ticketPath', function (req, res) {
    debug("nonce", {method: req.method, query: req.query, params: req.params, body: req.body});
    // Ödeme İşlemi Sorgulama Endpoint'i Örneği
    const merchantService = new Bex.MerchantService(config);
    merchantService.login()
        .then(function (loginResponse) {
            merchantService.result(loginResponse.Token, req.params.ticketPath)
                .then(function (result) {
                    res.send(result);
                })
                .catch(function (err) {
                    res.send(err);
                });
        })
        .catch(function (err) {
            res.send(err);
        });
});

module.exports = router;
