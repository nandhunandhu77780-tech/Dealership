/**
 * @desc    Health check endpoint
 * @route   GET /api/health
 * @access  Public
 */
export const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Installment Dealer API is running"
  });
};
