const express = require('express');
const router = express.Router();

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

    // Connection Token'ın Alınması
    merchantService.login()
        .then(function (response) {
            // Ticket Token'ı Üretilmesi
            const ticketResponse = merchantService.oneTimeTicket(response.Token, 1, urlForInstallments, urlForNonce);
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
                    console.error("merchantService/oneTimeTicket", "ticketResponse", err);
                    next(err);
                });
        })
        .catch(function (err) {
            console.error("merchantService/login", "MerchantLoginResponse", err);
            next(err);
        });
});

router.post('/bkm/installments', function (req, res) {
    // Endpoint'in Oluşturulması
    console.log("Request from BKM", req.body);

    if (req.body.bin && req.body.totalAmount && req.body.ticketId && req.body.signature) {

        const request = new Bex.InstallmentRequest(req.body.bin, req.body.totalAmount, req.body.ticketId, req.body.signature);
        const response = new Bex.InstallmentsResponse();

        if (Bex.EncryptionUtil.verifyBexSign(request.TicketId, request.Signature)) {

            let amount = Bex.MoneyUtils.toNumber(request.TotalAmount);
            let allInstallmentsForEveryBin = {};

            for (let binAndBank of request.binAndBanks()) {
                let bankCode = binAndBank.BankCode;
                let installmentsForThisBin = [];

                // baska bankalar icin vpos hazirlama

                let vposConfig = new Bex.VposConfig();
                vposConfig.BankIndicator = bankCode;
                vposConfig.VposUserId = "akapi";
                vposConfig.VposPassword = "TEST1234";
                vposConfig.addExtra("ClientId", "100111222");
                vposConfig.addExtra("storekey", "TEST1234");
                vposConfig.ServiceUrl = "http://srvirt01:7200/akbank";

                console.log("vposConfig", vposConfig);

                let installment = new Bex.Installment("1", Bex.MoneyUtils.toTRY(amount), Bex.MoneyUtils.toTRY(amount), Bex.EncryptionUtil.encryptWithBex(vposConfig));
                installmentsForThisBin.push(installment);
                // - end
                allInstallmentsForEveryBin[binAndBank.Bin] = installmentsForThisBin;
            }

            response.Installments = allInstallmentsForEveryBin;
            response.Status = "ok";
            response.Error = "";
            console.log("Response", JSON.stringify(response));
            res.json(response);
        }
        else {
            response.Status = "fail";
            response.Error = "signature verification failed";
            console.log("Response", JSON.stringify(response));
            res.json(response);
        }
    }
    else {
        const response = new Bex.InstallmentsResponse();
        response.Status = "fail";
        response.Error = "RequestBody fields cannot be null or signature verification failed";
        console.log("Response", JSON.stringify(response));
        res.json(response);
    }

});

function checkPayment(request) {
    const merchantNonceResponse = new Bex.MerchantNonceResponse();
    const merchantService = new Bex.MerchantService(config);
    merchantService.login()
        .then(function (response) {
            if (Bex.EncryptionUtil.verifyBexSign(request.TicketId, request.Signature)) {
                // İşlemin hala geçerliliğinin korunup, korumadığı kontrol edilir.
                // ....
                // basarili nonce cevabı

                merchantNonceResponse.Result = true;
                merchantNonceResponse.Nonce = request.Token;
                merchantNonceResponse.Id = request.Path;
                merchantNonceResponse.Message = "YOUR-MESSAGE-WILL-BE-STORED-IN-BKM";
                merchantService.sendNonceResponse(response.Token, merchantNonceResponse)
                    .then(function (response) {
                        console.info("merchantService/sendNonceResponse", "NonceResultResponse", response);
                    })
                    .catch(function (err) {
                        console.error("merchantService/sendNonceResponse", "NonceResultResponse", err);
                    });
            }
            else {
                merchantNonceResponse.Result = false;
                merchantNonceResponse.Nonce = request.Token;
                merchantNonceResponse.Id = request.Path;
                merchantNonceResponse.Message = "Signature verification failed";
                merchantService.sendNonceResponse(response.Token, merchantNonceResponse)
                    .then(function (response) {
                        console.info("merchantService/sendNonceResponse", "NonceResultResponse", response);
                    })
                    .catch(function (err) {
                        console.error("merchantService/sendNonceResponse", "NonceResultResponse", err);
                    });
            }

        })
        .catch(function (err) {
            console.error("merchantService/login", "MerchantLoginResponse", err);
        });

}

router.post('/bkm/nonce', function (req, res) {
    console.log("nonce", {method: req.method, query: req.query, params: req.params, body: req.body});
    const response = new Bex.NonceReceivedResponse();
    if (req.body.id && req.body.path && req.body.issuer && req.body.approver && req.body.token && req.body.signature && req.body.reply) {
        // asenkron işlemden önce Nonce isteğinin başarılı olarak alındığı iletilmelidir.
        response.Result = "ok";
        response.Data = "ok";
        res.json(response);

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

router.get('/result/:ticket', function (req, res) {
    // Ödeme İşlemi Sorgulama Endpoint'i Örneği
    const merchantService = new Bex.MerchantService(config);
    merchantService.login()
        .then(function (response) {
            merchantService.result(response.Token, req.params.ticket)
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