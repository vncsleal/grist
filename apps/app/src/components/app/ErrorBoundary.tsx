import React, { Component } from "react";
import { Button } from "@heroui/react/button";
import { Alert } from "@heroui/react/alert";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      const isChunkError = this.state.error.message?.includes("dynamically imported");
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-background">
          <div className="flex flex-col items-center gap-4 max-w-lg w-full">
            <Alert status="danger" className="w-full">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {isChunkError ? "Failed to load page" : "App Error"}
                </Alert.Title>
                <Alert.Description>
                  {isChunkError
                    ? "A network error occurred while loading this page."
                    : this.state.error.message}
                </Alert.Description>
              </Alert.Content>
            </Alert>
            <Button variant="ghost" onPress={this.handleRetry}>
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
