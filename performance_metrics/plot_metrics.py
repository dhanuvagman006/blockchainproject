import json
import pandas as pd
import matplotlib.pyplot as plt
import os

def plot_metrics():
    # Load JSON data
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, 'metrics.json')
    
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Styling
    plt.style.use('seaborn-v0_8-whitegrid')
    
    # 1. Plot Latency
    df_lat = pd.DataFrame(data['latency'])
    plt.figure(figsize=(10, 6))
    plt.plot(df_lat['transactions'], df_lat['ethereum_sec'], marker='o', label='Ethereum (Public Blockchain)', color='#4c72b0')
    plt.plot(df_lat['transactions'], df_lat['hyperledger_sec'], marker='o', label='Hyperledger Fabric (Private Blockchain)', color='#dd8452')
    plt.xscale('log')
    plt.yscale('log')
    plt.title('Latency', fontsize=16)
    plt.xlabel('No. of Transactions', fontsize=12)
    plt.ylabel('Transaction Time (sec)', fontsize=12)
    plt.xticks([1, 10, 100, 1000, 10000], ['1', '10', '100', '1000', '10000'])
    plt.legend()
    plt.savefig(os.path.join(script_dir, 'latency_graph.png'))
    plt.close()

    # 2. Plot Throughput
    df_tp = pd.DataFrame(data['throughput'])
    plt.figure(figsize=(10, 6))
    plt.plot(df_tp['transactions'], df_tp['ethereum_tps'], marker='o', label='Ethereum (Public Blockchain)', color='#4c72b0')
    plt.plot(df_tp['transactions'], df_tp['hyperledger_tps'], marker='o', label='Hyperledger Fabric (Private Blockchain)', color='#dd8452')
    plt.xscale('log')
    plt.yscale('log')
    plt.title('Throughput', fontsize=16)
    plt.xlabel('No. of Transactions', fontsize=12)
    plt.ylabel('Transactions/second', fontsize=12)
    plt.xticks([1, 10, 100, 1000, 10000], ['1', '10', '100', '1000', '10000'])
    plt.legend()
    plt.savefig(os.path.join(script_dir, 'throughput_graph.png'))
    plt.close()

    # 3. Plot Execution Time
    df_exec = pd.DataFrame(data['execution_time'])
    plt.figure(figsize=(10, 6))
    plt.plot(df_exec['transactions'], df_exec['ethereum_sec'], marker='o', label='Ethereum (Public Blockchain)', color='#4c72b0')
    plt.plot(df_exec['transactions'], df_exec['hyperledger_sec'], marker='o', label='Hyperledger Fabric (Private Blockchain)', color='#dd8452')
    plt.xscale('log')
    plt.yscale('log')
    plt.title('Execution Time', fontsize=16)
    plt.xlabel('No. of Transactions', fontsize=12)
    plt.ylabel('Transaction Time (sec)', fontsize=12)
    plt.xticks([1, 10, 100, 1000, 10000], ['1', '10', '100', '1000', '10000'])
    plt.legend()
    plt.savefig(os.path.join(script_dir, 'execution_time_graph.png'))
    plt.close()

    print("Successfully generated latency_graph.png, throughput_graph.png, and execution_time_graph.png!")

if __name__ == "__main__":
    plot_metrics()
