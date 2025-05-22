"""
Connects to MetaTrader 5, fetches account information and trade history,
calculates basic performance statistics, and logs the information.
"""
# Import the MetaTrader5 package
import MetaTrader5 as mt5
# Import datetime and timedelta from the datetime module
from datetime import datetime, timedelta
# Import pandas for data analysis
import pandas as pd
# Import logging module
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def connect_to_mt5():
    """
    Initializes the connection to the MetaTrader 5 terminal.

    Returns:
        bool: True if connection is successful, False otherwise.
    """
    logging.info("Attempting to connect to MetaTrader 5...")
    # Attempt to initialize MetaTrader 5
    if not mt5.initialize():
        logging.error(f"MetaTrader5 initialization failed, error code = {mt5.last_error()}")
        return False
    logging.info("MetaTrader 5 connection established successfully.")
    return True

def get_account_info():
    """
    Retrieves and logs account information from MetaTrader 5.
    This includes login, server, balance, equity, and profit.
    """
    try:
        account_info = mt5.account_info()
        if account_info is not None:
            # Convert account_info object to a dictionary
            account_info_dict = account_info._asdict()
            logging.info("Account Information:")
            logging.info(f"  Login: {account_info_dict['login']}")
            logging.info(f"  Server: {account_info_dict['server']}")
            logging.info(f"  Balance: {account_info_dict['balance']}")
            logging.info(f"  Equity: {account_info_dict['equity']}")
            logging.info(f"  Profit: {account_info_dict['profit']}")
        else:
            logging.error("Failed to retrieve account information.")
    except Exception as e:
        logging.error(f"Unexpected error in get_account_info: {e}")

def get_trade_history(date_from, date_to):
    """
    Retrieves trade history (deals) for a specified date range.

    Args:
        date_from (datetime): The start date for fetching trade history.
        date_to (datetime): The end date for fetching trade history.

    Returns:
        list: A list of trade deal objects if successful, otherwise None or an empty list.
    """
    try:
        deals = mt5.history_deals_get(date_from, date_to)
        if deals is None:
            logging.error(f"Failed to retrieve trade history, error code = {mt5.last_error()}")
            return None
        if len(deals) > 0:
            logging.info(f"Number of trades found: {len(deals)}")
            return deals
        else:
            logging.info("No trades found in the specified period.")
            return []
    except Exception as e:
        logging.error(f"Unexpected error in get_trade_history: {e}")
        return None

def calculate_basic_statistics(deals):
    """
    Calculates and logs basic performance statistics from a list of trade deals.

    Args:
        deals (list): A list of trade deal objects obtained from MetaTrader 5.
                      Each deal object is expected to have 'entry' and 'profit' attributes.
    """
    if deals is None or not deals:
        logging.warning("No trade data available to calculate statistics.")
        return

    try:
        # Convert the list of deals to a pandas DataFrame
        df = pd.DataFrame(list(deals))

        # Filter for closed trades (entry type DEAL_ENTRY_OUT)
    # mt5.DEAL_ENTRY_OUT (represented by integer 1) indicates a closing trade operation.
    # Other entry types might include DEAL_ENTRY_IN (0) for opening trades,
    # DEAL_ENTRY_INOUT (2) for rollovers, etc. We are interested in closed trades for profit/loss calculation.
        closed_trades_df = df[df['entry'] == 1] 

        if closed_trades_df.empty:
        logging.warning("No closed trades found to calculate statistics. Statistics are based on closed trades only.")
            return

        # Calculate statistics
        total_trades = len(closed_trades_df)
        winning_trades = len(closed_trades_df[closed_trades_df['profit'] > 0])
        losing_trades = len(closed_trades_df[closed_trades_df['profit'] < 0])
        win_rate = (winning_trades / total_trades) * 100 if total_trades > 0 else 0
        total_net_profit = closed_trades_df['profit'].sum()
        average_profit_loss = total_net_profit / total_trades if total_trades > 0 else 0

        # Log the statistics
        logging.info("\nTrade Statistics:")
        logging.info("--------------------")
        logging.info(f"Total Trades: {total_trades}")
        logging.info(f"Winning Trades: {winning_trades}")
        logging.info(f"Losing Trades: {losing_trades}")
        logging.info(f"Win Rate: {win_rate:.2f}%")
        logging.info(f"Total Net Profit: {total_net_profit:.2f}")
        logging.info(f"Average Profit/Loss per Trade: {average_profit_loss:.2f}")
    except Exception as e:
        logging.error(f"Unexpected error in calculate_basic_statistics: {e}")

def disconnect_from_mt5():
    """
    Shuts down the connection to the MetaTrader 5 terminal.
    """
    mt5.shutdown()
    logging.info("MetaTrader 5 connection closed.")

if __name__ == "__main__":
    # Attempt to connect to MetaTrader 5
    if connect_to_mt5():
        # Retrieve and print account information
        get_account_info()

        # Define date range for trade history
        date_to = datetime.now()
        date_from = date_to - timedelta(days=30)
        logging.info(f"Fetching trade history from {date_from} to {date_to}")

        # Retrieve trade history
        trade_deals = get_trade_history(date_from, date_to)
        
        # Calculate and display basic statistics
        calculate_basic_statistics(trade_deals)
        
        # If connection is successful, disconnect
        disconnect_from_mt5()
