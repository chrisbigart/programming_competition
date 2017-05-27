#include <stdio.h>
#include <stdlib.h>

int main(int argc, char** argv)
	{
	char* output;
	int count;
	int i;

	for(i = 0; i < argc; i++)	
		printf("%s\n", argv[i]);

	return 0;
	}
