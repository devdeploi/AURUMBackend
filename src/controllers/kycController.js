
// @desc    Verify Bank Account (Penny Drop Simulation)
// @route   POST /api/kyc/verify-bank
// @access  Public
const verifyBankAccount = async (req, res) => {
    const { accountNumber, ifscCode, accountHolderName } = req.body;

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock Validation Logic
    if (!accountNumber || !ifscCode) {
        return res.status(400).json({ message: 'Account Number and IFSC are required' });
    }

    // Simulate success
    // In a real application, you would call Razorpay or Cashfree Fund Account Validation API here.

    // We will assume success for this demo.
    // For realistic simulation, maybe check if account number length > 5
    if (accountNumber.length < 5) {
        return res.status(400).json({ message: 'Invalid Account Number' });
    }

    // Mock Response Data
    const mockVerifiedName = accountHolderName ? accountHolderName.toUpperCase() : "VERIFIED MERCHANT NAME";

    // Simple mock IFSC mapping logic (just for demo)
    let bankName = "HDFC Bank";
    let branchName = "Mumbai Main Branch";

    if (ifscCode.startsWith('SBIN')) {
        bankName = "State Bank of India";
        branchName = "Connaught Place, Delhi";
    } else if (ifscCode.startsWith('ICIC')) {
        bankName = "ICICI Bank";
        branchName = "Bandra Kurla Complex, Mumbai";
    }

    res.json({
        status: 'success',
        data: {
            verifiedName: mockVerifiedName,
            bankName,
            branchName,
            utr: "MOCK_UTR_" + Date.now()
        },
        message: 'Bank account verified successfully'
    });
};

// @desc    Verify PAN Card
// @route   POST /api/kyc/verify-pan
// @access  Public
const verifyPAN = async (req, res) => {
    const { panNumber, name } = req.body;

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!panNumber || panNumber.length !== 10) {
        return res.status(400).json({ message: 'Invalid PAN Number format. Must be 10 characters.' });
    }

    // Mock Response
    // Use the provided name to ensure it matches the bank details in the frontend check
    // If no name provided, fall back to default
    const mockVerifiedName = name ? name.toUpperCase() : "VERIFIED MERCHANT NAME";

    res.json({
        status: 'success',
        data: {
            verifiedName: mockVerifiedName,
            panType: 'Individual',
            verificationId: "PAN_VERIFY_" + Date.now()
        },
        message: 'PAN verified successfully'
    });
};

// const verifyBankAccount = async (req, res) => {
//   const { accountNumber, ifscCode, accountHolderName } = req.body;

//   if (!accountNumber || !ifscCode || !accountHolderName) {
//     return res.status(400).json({
//       status: "failed",
//       message: "Account number, IFSC, and account holder name are required"
//     });
//   }

//   try {
//     const response = await axios.post(
//       "https://api.razorpay.com/v1/fund_accounts/validations",
//       {
//         account_number: accountNumber,
//         ifsc: ifscCode,
//         name: accountHolderName
//       },
//       {
//         auth: {
//           username: process.env.RAZORPAY_KEY_ID,
//           password: process.env.RAZORPAY_KEY_SECRET
//         }
//       }
//     );

//     const data = response.data;

//     if (data.status !== "completed") {
//       return res.status(400).json({
//         status: "failed",
//         message: "Bank account verification failed"
//       });
//     }

//     res.json({
//       status: "success",
//       data: {
//         verifiedName: data.beneficiary_name,
//         bankName: data.bank_name,
//         branchName: data.branch,
//         utr: data.utr
//       },
//       message: "Bank account verified successfully"
//     });

//   } catch (error) {
//     res.status(400).json({
//       status: "failed",
//       message:
//         error.response?.data?.error?.description ||
//         "Unable to verify bank account"
//     });
//   }
// };


export { verifyBankAccount, verifyPAN };






