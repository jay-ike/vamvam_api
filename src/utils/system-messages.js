/*jslint node */
const errors = {
    alreadyAssigned: {
        message: {
            en: "Sorry this delivery has already been assigned",
            fr: "Désolé, cette livraison a déjà été attribuée"
        },
        status: 451
    },
    alreadyCancelled: {
        message: {
            en: "Sorry this resource has already been cancelled",
            fr: "Désolé, cette ressource a déjà été annulée"
        },
        status: 450
    },
    alreadyRated: {
        message: {
            en: "Sorry this delivery has already been rated",
            fr: "Désolé, cette livraison a déjà été évaluée"
        },
        status: 452
    },
    alreadyRegistered: {
        message: {
            en: "Sorry but you've already made apply for a registration",
            fr: "Désolé, mais vous avez déjà fait une demande d'enregistrement."
        },
        status: 452
    },
    alreadyReported: {
        message: {
            en: "Sorry this delivery already has conflicts",
            fr: "Désolé, cette livraison a déjà des conflits"
        },
        status: 452
    },
    cannotPerformAction: {
        message: {
            en: "You can not perform this action now",
            fr: "Vous ne pouvez pas effectuer cette action actuellement"
        },
        status: 454
    },
    conflictAssigned: {
        message: {
            en: "This conflict has already been assigned to a driver",
            fr: "Ce conflit a déjà été attribué à un conducteur"
        },
        status: 410
    },
    conflictNotFound: {
        message: {
            en: "you're looking for a non-existing conflict",
            fr: "vous recherchez un conflit inexistant"
        },
        status: 404
    },
    deliveryNotConflicted: {
        message: {
            en: "This delivery has no conflicts",
            fr: "Cette livraison n'est pas conflictuelle"
        },
        status: 454
    },
    deliveryTimeout: {
        message: {
            en: "The delay to react to this delivery request is over",
            fr: "Le délai de réaction à cette demande de livraison est dépassé"
        },
        status: 410
    },
    distanceExceeding: {
        message: {
            en: "The distance to fulfill your delivery cannot exceed 35km",
            fr: "La distance à parcourir pour effectuer la livraison " +
            "ne peut excéder 35 km."
        },
        status: 400
    },
    driverNotFound: {
        message: {
            en: "The driver you're looking for does not exists",
            fr: "Le transporteur que vous recherchez n'existe pas"
        },
        status: 404
    },
    emptyWallet: {
        message: {
            en: "An empty wallet cannot be debited!",
            fr: "Un portefeuille vide ne peut être débité!"
        },
        status: 424
    },
    existingUser: {
        message: {
            en: "This user already exists consider logging in",
            fr: "Cet utilisateur existe déjà, pensez à vous connecter"
        },
        status: 453
    },
    forbiddenAccess: {
        message: {
            en: "You are forbidden from accessing this resource",
            fr: "L'accès à cette ressource vous est interdit"
        },
        status: 403
    },
    inactiveAccount: {
        message: {
            en:
            "Your account is not yet active please contact the support" +
            " for any issue",
            fr:
            "Votre compte n'est pas encore actif, veuillez contacter le" +
            " support pour tout problème."
        },
        status: 401
    },
    internalError: {
        message: {
            en: "Something went wrong while processing your request",
            fr: "Un problème s'est produit lors du traitement" +
            " de votre demande"
        },
        status: 500
    },
    invalidCode: {
        message: {
            en: "you provided an invalid verification code",
            fr: "vous avez fourni un code de vérification non valide"
        },
        status: 441
    },
    invalidCredentials: {
        message: {
            en: "You provided invalid authentication credentials",
            fr:
            "Vous avez fourni des informations " +
            "d'authentification non valides"
        },
        status: 400
    },
    invalidLocation: {
        message: {
            en: "The latitude and longitude must be a valid number",
            fr: "La latitude et la longitude doivent être des nombres valides."
        },
        status: 400
    },
    invalidUploadValues: {
        message: {
            en: "you should provide informations you want to update",
            fr: "vous devez fournir les informations que vous " +
            "souhaitez mettre à jour"
        },
        status: 400
    },
    invalidValues: {
        message: {
            en: "you provided one or many invalid informations",
            fr: "Vous avez fourni une ou plusieurs informations invalide"
        },
        status: 400
    },
    invalidRemove: {
        message: {
            en: "The number of bonus points to be reduced must be less than the current number of bonus points.",
            fr: "Le nombre de points de bonification à réduire doit être inférieur au nombre actuel de points de bonification."
        },
        status: 400
    },
    invalidDate: {
        message: {
            en: "The date you have entered is not valid.",
            fr: "La date que vous avez indiquée n'est pas valide."
        },
        status: 400
    },
    nonexistingUser: {
        message: {
            en: "This user does not exists please consider signing up",
            fr: "Cet utilisateur n'existe pas, veuillez vous inscrire"
        },
        status: 404
    },
    notAuthorized: {
        message: {
            en: "You are not authorized to perform this action",
            fr: "Vous n'êtes pas autorisé à effectuer cette action"
        },
        status: 401
    },
    notFound: {
        message: {
            en: "Item not found",
            fr: "Objet non trouvé"
        },
        status: 404
    },
    otpSendingFail: {
        message: {
            en: "Could not send OTP through SMS",
            fr: "Impossible d'envoyer l'OTP par SMS"
        },
        status: 440
    },
    otpVerificationFail: {
        message: {
            en: "Your code has expired please, consider asking for a new one",
            fr: "Votre code a expiré, veuillez demander un nouveau code."
        },
        status: 440
    },
    paymentAlreadyVerified: {
        message: {
            en: "This payment has already been verified!",
            fr: "Ce paiement a déjà été vérifié !"
        },
        status: 401
    },
    paymentApproveFail: {
        message: {
            en: "Unapproved payment!",
            fr: "Paiement non approuvé!"
        },
        status: 401
    },
    paymentSendingFail: {
        message: {
            en: "Could not initalize payment",
            fr: "Impossible d'initialiser le payment"
        },
        status: 440
    },
    pendingRegistration: {
        message: {
            en: "we processing your registration please wait for our" +
            " response and consider contacting the support",
            fr: "Nous traitons votre inscription. Veuillez attendre notre" +
            " réponse et envisager de contacter le service d'assistance."
        },
        status: 440
    },
    requestOTP: {
        message: {
            en: "invalid OTP, you should consider requesting another one",
            fr: "OTP non valide, vous devriez envisager d'en demander un autre."
        },
        status: 448
    },
    sponsorCodeExisting: {
        message: {
            en: "The sponsor code you've entered is already assigned",
            fr: "Ce code de parrainage est déjà attribué"
        },
        status: 451
    },
    tokenInvalid: {
        message: {
            en: "Your access key is invalid, please login again",
            fr: "Votre clé d'accès est Invalide, " +
            "veuillez vous connecter à nouveau"
        },
        status: 402
    },
    ttlNotExpired: {
        message: {
            en: "your previous request has not yet expired please wait",
            fr: "votre demande précédente n'a pas encore expiré" +
            " veuillez patienter"
        },
        status: 422
    },
    unsupportedType: {
        message: {
            en: "the type you provided is not yet supported",
            fr: "le type que vous avez fourni n'est pas encore pris en charge"
        },
        status: 414
    }
};

const eventMessages = {
    addBonus: {
        en: {
            body: "You have received number bonus points ",
            title: "Incentive bonus!"
        },
        fr: {
            body: "Vous avez reçus number points bonus",
            title: "Prime d'encouragement!"
        }
    },
    deliveryAccepted: {
        en: {
            body: "A driver is available for your delivery",
            title: "Delivery accepted"
        },
        fr: {
            body: "Un chauffeur est disponible pour votre livraison",
            title: "Livraison acceptée"
        }
    },
    deliveryArchived: {
        en: {
            body: "We are sorry but we couldn't complete your delivery" +
            " due to {cause}. Please, consider reaching out the support",
            title: "Your delivery has been archived"
        },
        fr: {
            body: "Nous sommes désolés mais nous n'avons pas pu effectuer " +
            "votre livraison à cause de {cause}. Veuillez envisager de" +
            " contacter le service d'assistance",
            title: "Votre livraison a été archivée"
        }
    },
    deliveryCancelled: {
        en: {
            body: "Sorry but the client has cancelled the delivery",
            title: "Delivery canceled"
        },
        fr: {
            body: "Désolé mais le client a annulé la livraison",
            title: "Livraison annulée"
        }
    },
    deliveryEnd: {
        en: {
            body: "Your delivery is now completed thank you and see you soon",
            title: "Delivery completed"
        },
        fr: {
            body: "Votre livraison est maintenant terminée merci et à bientôt",
            title: "Livraison terminée"
        }
    },
    deliveryStarted: {
        en: {
            body: "Your delivery has started you can keep an eye its evolution",
            title: "Delivery started"
        },
        fr: {
            body: "Votre livraison a commencée, vous pouvez" +
            " suivre son évolution",
            title: "Début de la livraison"
        }
    },
    driverArrived: {
        en: {
            body: "Please once you give him the package, confirm it here",
            title: "The driver has arrived"
        },
        fr: {
            body:
            "Une fois que vous lui aurez remis le paquet," +
            " veuillez le confirmer ici.",
            title: "Le chauffeur est arrivé"
        }
    },
    failurePayment: {
        en: {
            body: "You have tried to make a payment of amount XAF" +
            " without success",
            title: "Failed payment!"
        },
        fr: {
            body: "Vous avez essayé d'effectuer un paiement de" +
            " amount XAF sans succès",
            title: "Echec du paiement!"
        }
    },
    newAssignment: {
        en: {
            body: "You have been tasked to complete a conflicting delivery",
            title: "Emergency Alert"
        },
        fr: {
            body:
            "Vous avez été chargé(e) de mener à bien une" +
            " livraison conflictuelle",
            title: "Alerte d'urgence"
        }
    },
    newConflict: {
        en: {
            body:
            "A conflict has been reported during your delivery," +
            " please contact the support for further informations",
            title: "Conflict reported"
        },
        fr: {
            body:
            "Un conflit a été signalé lors de votre livraison, veuillez" +
            " contacter le service d'assistance pour plus d'informations",
            title: "Conflit signalé"
        }
    },
    newDelivery: {
        en: {
            body: "You have a new delivery request close to you, check it out",
            title: "New delivery"
        },
        fr: {
            body:
            "Vous avez une nouvelle demande de livraison près" +
            " de vous, consultez-la",
            title: "Nouvelle livraison"
        }
    },
    newDriverRegistration: {
        en: {
            body: "Hello {userName}, \na driver with named {driverName} has" +
            " subscribe to vamvam pro please verify his profile in order to" +
            " validate his account",
            title: "New driver subscription"
        },
        fr: {
            body:
            "Salut {userName} un conducteur nommé {driverName} " +
            "s'est inscrit à vamvam pro veuillez vérifier son profil" +
            " afin de valider son compte",
            title: "Nouvel Enregistrement de livreur"
        }
    },
    newInvitation: {
        en: {
            body: "You have been invited to track a delivery",
            title: "New Invitation"
        },
        fr: {
            body: "Vous avez été invité à suivre une livraison",
            title: "Nouvelle Invitation"
        }
    },
    newRoom: {
        en: {
            body: "Now you can talk to your delivery contact.",
            title: "New discussion"
        },
        fr: {
            body:
            "Vous pouvez désormais dialoguer avec votre interlocuteur" +
            "  pour la livraison",
            title: "Nouvelle discussion"
        }
    },
    registrationRejected: {
        en: {
            body: "Hello {userName},\n we are sorry to announce you that " +
            "your souscription has been rejected so please consider " +
            "reaching out the support.",
            title: "Souscription rejected"
        },
        fr: {
            body: "Bonjour {userName}, nous sommes désolés " +
            "de vous annoncer que votre souscription a été rejetée. " +
            "Veuillez donc contacter le service d'assistance.",
            title: "Souscription rejétée"
        }
    },
    registrationValidated: {
        en: {
            body: "Hello {userName},\n we are proud to welcome you to our" +
            " amazing community of vamvam driver you can now receive " +
            "new delivery order once you'll top up your account for more " +
            "informations please contact the support for further informations",
            title: "Souscription validated"
        },
        fr: {
            body: "Bonjour {userName}, nous sommes fiers de vous " +
            "accueillir dans notre incroyable communauté de chauffeurs " +
            "vamvam. Vous pouvez maintenant recevoir de nouveaux ordres" +
            " de livraison une fois que vous aurez rechargé votre compte," +
            " veuillez contacter le support pour plus d'informations.",
            title: "Souscription validée"
        }
    },
    removeBonus: {
        en: {
            body: "Your account has been debited with number bonus points",
            title: "Withdrawal of bonus points!"
        },
        fr: {
            body: "Votre compte a été débité de number points bonus",
            title: "Retrait de point bonus!"
        }
    },
    roomDeletedBody: {
        en: "This discussion is now archived due to the end of the delivery",
        fr:
        "Cette discussion est désormais archivée suite à la fin" +
        " de la livraison."
    },
    successPayment: {
        en: {
            body: "You have topped up your account by amount XAF",
            title: "Successful payment!"
        },
        fr: {
            body: "Vous avez rechargé votre compte de amount XAF",
            title: "Paiement effectuer avec succès!"
        }
    },
    userJoined: {
        en: {
            body: "{userName} joined the {roomName} discussion",
            title: "New user joined a discussion"
        },
        fr: {
            body: "{userName} a rejoint la discussion {roomName}",
            title: "Un nouvel utilisateur a rejoint une discussion"
        }
    },
    withSameContent(title, body) {
        return {
            en: {body, title},
            fr: {body, title}
        };
    },
    withSameTitle(title, body) {
        return {
            en: {body: body?.en, title},
            fr: {body: body?.fr, title}
        };
    },
    withTransfomedBody(message, func) {
        const result = {
            en: {title: message?.en?.title},
            fr: {title: message?.fr?.title}
        };
        result.en.body = func(message?.en?.body ?? "", "en");
        result.fr.body = func(message?.fr?.body ?? "", "fr");
        return result;
    }
};

module.exports = Object.freeze({
    errors,
    eventMessages
});