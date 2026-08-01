const crypto = require('crypto');


function generateFileHash(buffer){

    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

}


module.exports = {
    generateFileHash
};